# Carrossel, badges, variantes e notificações

As quatro tarefas foram implementadas e verificadas sequencialmente. As alterações anteriores foram preservadas. Não houve commit, push, migração nova ou alteração destrutiva no banco do projeto; os testes de integração usam bancos temporários isolados.

## Tarefa 1 — Carrossel

Arquivos: `src/app/App.tsx`, `tests/carousel.spec.ts`.

As duas setas só são renderizadas quando `featuredProducts.length > 1`, usando a seleção real recebida do endpoint do carrossel. O handler também retorna sem navegar quando há menos de dois slides. Não há controles invisíveis restantes. O estado vazio, a imagem, o zoom, o texto e o botão de produtos publicados continuam intactos. Produtos não publicados continuam exclusivos do carrossel, sem VER MAIS nem links de compra.

O índice ativo já era limitado à quantidade atual de slides; essa proteção foi mantida e testada após redução dinâmica. O autoplay já exigia dois slides.

Validação da etapa: oito cenários Playwright aprovados, cobrindo zero a cinco slides nas larguras 320, 390, 768 e 1440 px, navegação circular, redução para um e slide único não publicado.

## Tarefa 2 — Badges automáticos

Arquivos: `src/styles/store-theme.css`, `tests/badges.spec.ts`.

A altura vinha do aspect-ratio do contêiner, portanto variava com a largura de cada texto e com os limites responsivos. Vermelho e amarelo já compartilhavam o mesmo caminho SVG e viewBox; o problema estava no cálculo das dimensões do contêiner.

Altura final compartilhada: **12 px**, independentemente da largura. O SVG ocupa exatamente essa altura. O mesmo caminho arredondado e o viewBox `0 0 1792 388.3` foram preservados. As larguras, cores e fontes existentes continuam específicas de cada texto. O alinhamento superior cobre a borda do card, sem faixa acima.

Validação da etapa: 18 cenários distintos aprovados entre as execuções e a correção da tolerância subpixel dos testes. Incluem medição da altura do caminho SVG pintado via getBBox/getScreenCTM, centralização do texto, quatro larguras, desktop e toque, 15% visível, hover do card, 225 ms, teclado, movimento reduzido, estoque por variante e geometria manual intacta de 112 × 34,947 px.

## Tarefa 3 — Espaçamento

Arquivos: `src/app/App.tsx`, `tests/product-card-geometry.spec.ts`.

No ProductCard compartilhado pelo catálogo e pelos favoritos, a distância entre cores e tamanhos passou de **8 para 16 px**: o gap de 8 px existente foi mantido e o grupo de tamanhos recebe mais 8 px somente quando há cores. Grupos ausentes não geram contêineres vazios. Formulários do Manager não foram alterados.

O espaço interno continua 8 px entre cores e 4 px entre tamanhos; dimensões, alinhamento horizontal e regra de espaçamento do botão de carrinho foram preservados.

Validação da etapa: quatro cenários Playwright aprovados, medindo a separação e os gaps internos em 320, 390, 768 e 1440 px, sem overflow, com fotos 4:5 e zoom preservados.

## Tarefa 4 — Toasts

Arquivos: `src/app/components/StoreToast.tsx`, `src/app/lib/notifications.ts`, `src/app/hooks/useShopping.ts`, `src/app/App.tsx`, `src/app/components/CheckoutPage.tsx`, `src/main.tsx`, `src/styles/toasts.css`, `tests/shopping.spec.ts`, `tests/toast-helpers.ts`.

Biblioteca utilizada: **Sonner 2.0.8, já instalada**, com apresentação inspirada no ButterPop. Foram consultados o [README oficial do ButterPop](https://github.com/Ayushx309/ButterPop.js) e seu [módulo ESM oficial](https://github.com/Ayushx309/ButterPop.js/blob/main/butterpop.esm.js). A API do exemplo existe e o pacote 1.0.4 expõe main/module, mas não declara tipos TypeScript. No código consultado, a pausa trata mouse/toque e visibilidade da página; não trata entrada de foco do teclado. Por essa limitação de acessibilidade e pelo custo de manter integração paralela, foi adotada a alternativa visual permitida no pedido, usando a infraestrutura existente.

Um único Toaster continua montado. Na loja, o componente React exibe tema escuro, ícones e cores semânticas, topo direito, duração de 2500 ms, progresso, fechar, clique para dispensar e pausa por hover, toque, foco e página oculta. O temporizador e a barra usam o mesmo tempo restante; o timer automático nativo fica desativado somente nesses toasts, evitando dois relógios concorrentes. O Manager mantém seu tema claro e duração anterior.

Após uma adição confirmada, useShopping cria apenas o toast de sucesso existente e acrescenta sua ação. O callback passado pelo App chama **setCartOpen(true)**, abrindo o CartDrawer existente sem alternar, navegar, recarregar ou adicionar novamente. O botão interrompe a propagação, executa o callback e só então dispensa o toast. Favoritos, remoções e mudanças de quantidade não recebem essa ação.

Validação da etapa: 15 cenários Playwright aprovados, cobrindo os quatro tipos, duração, progresso, pausas, fechamento, quatro larguras, múltiplos toasts, movimento reduzido, ação para visitante e USER, carrinho já aberto, documento e URL intactos, quantidade inalterada, falhas de API, notificações únicas e atualizações passivas silenciosas.

## Validação geral

- Frontend: 67 testes unitários aprovados; typecheck e build aprovados.
- Backend: 116 testes aprovados em execução serial isolada. A primeira execução concorrente apresentou falha; a execução serial completa passou.
- Playwright: **254 cenários distintos aprovados**, considerando a suíte completa e a reexecução dos casos corrigidos. A execução completa teve 250 aprovados, quatro falhas e dois ignorados; a reexecução passou nos quatro casos corrigidos e na redução explícita de dois slides para um (cinco aprovados).
- Dois cenários de upload real no Cloudinary foram ignorados pelas regras existentes dos testes: exigem `E2E_REAL_UPLOAD=1` e configuração de credenciais. Nenhum upload externo foi habilitado para estas tarefas.
- Build backend e `git diff --check` aprovados.
- Os testes antigos do menu ADMIN e do preview vazio foram alinhados às funcionalidades já existentes de Favoritos para ADMIN e de exibição de Sem badge. O teste de erro de sincronização reconhece e fecha o sucesso anterior antes de verificar ausência de sucesso na operação que falha, evitando confundir dois estados independentes.

Sem pendências funcionais identificadas nas quatro tarefas. A única cobertura não executada é a dos dois uploads reais opcionais, externos ao escopo dessas alterações.
