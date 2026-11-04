# Badges automáticos de estoque

## Regras

O cálculo utiliza somente o estoque retornado pelo servidor, sem descontar carrinhos nem reservar unidades.

- Com cor e tamanho selecionados, considera exclusivamente essa variante.
- Sem seleção explícita completa, o frontend não exibe badge automático. Cor e tamanho devem ser escolhidos; produtos com uma única dimensão exigem somente essa dimensão. Filtros do Aside não contam como seleção.
- `ÚLTIMA PEÇA`: a variante selecionada tem com estoque 1 e o toggle está habilitado; tem prioridade.
- `POUCAS UNIDADES`: a variante selecionada tem estoque positivo dentro do limite, o toggle está habilitado e o badge vermelho não foi escolhido. Inclui o fallback de estoque 1 quando o toggle vermelho está desativado.
- Estoque 0, acima do limite, combinação inexistente ou ambos os toggles desligados não produzem badge automático.

O frontend valida a seleção em `src/app/lib/selected-stock-badge.ts` e delega prioridade e toggles à função em `backend/src/lib/stock-badges.ts`, é compartilhada com o frontend e testada com os contratos públicos reais. Nenhum texto automático é gravado em `Product.badge`.

## Persistência e API

`StoreSettings` recebe `showLowStockBadge` e `showLastUnitBadge`, booleanos não nulos, ambos com default `true`. O limite existente permanece a única fonte de threshold.

A migration incremental `20261007000000_stock_badges` foi aplicada ao banco local. Nenhuma migration antiga foi editada. O verificador comparou contagens e hashes SHA-256 de todos os campos anteriores nas 13 tabelas existentes, com resultados idênticos.

`GET /settings` retorna as três configurações de estoque. `PUT /settings` aceita atualizações parciais estritas e preserva os campos omitidos. Somente ADMIN pode acessar/alterar esse contrato; USER e GUEST são rejeitados.

`GET /settings/public` acrescenta apenas `lowStockThreshold`, `showLowStockBadge` e `showLastUnitBadge` aos dados públicos existentes de endereço, WhatsApp e horários. O contrato `/settings/store` permanece dedicado aos dados da loja.

As opções ficam dentro do card **Estoque**, em **Manager → Configurações**, junto do limite existente. Usam checkboxes independentes, labels acessíveis, foco visível por teclado e o botão de salvar existente. O banco é a fonte de verdade; não há persistência dessas opções em localStorage.

## Apresentação e atualização

O componente `ProductBadges` utiliza o path SVG fornecido em slots absolutos independentes dentro da fotografia. O automático começa em `top: 0; left: 0`; o manual fica sempre abaixo do slot reservado, mesmo sem automático. O slot responsivo tem altura máxima 54px e intervalo 2px, reservando a faixa central dos controles de 44px. A fotografia continua com proporção 4:5 e somente a imagem recebe zoom.

Etiquetas vermelha/manual aumentam 12% em relação à largura calculada anterior; a amarela diminui 15%. Os automáticos mantêm a largura e têm metade da altura anterior (compressão vertical autorizada), sem mudar o path. Fontes: vermelha 6–8px, amarela 5–7px; manual preservada em 8–11,2px. As cores manuais persistidas são preservadas; vermelho `#B42332`/branco e amarelo `#F4EC03`/`#121500` permanecem independentes do texto manual. O texto ocupa a área retangular, sem invadir a ponta.

No desktop, 28% do automático fica visível fora do hover. O hover do card inteiro expande somente seu badge em 225ms. Touch e foco de teclado revelam o badge; movimento reduzido desativa a transição. O manual não se move.

Os cards do catálogo e de favoritos compartilham esse componente. Em favoritos, o cálculo aproveita o catálogo atualizado quando disponível, sem alterar o funcionamento dos favoritos ou do carrinho. Os detalhes do produto não exibiam o badge manual e permanecem com sua apresentação existente.

A confirmação de uma unidade de um produto com estoque 2 gera estoque 1 e muda `POUCAS UNIDADES → ÚLTIMA PEÇA`. O cancelamento confirmado restaura estoque 2 e volta a `POUCAS UNIDADES`. A integração usa os endpoints e estoques públicos reais; não foi acrescentada lógica de badge em confirmação ou cancelamento.

A atualização utiliza os mecanismos existentes: callbacks de alteração no Manager, foco/visibilidade e refresh de 30 segundos da loja. Salvar configurações também aciona o evento existente de atualização dos dados da loja. Não há atualização por WebSocket. Sem configurações públicas válidas, os badges automáticos ficam ocultos; o manual continua disponível.

## Arquivos desta tarefa

Criados:

- `backend/prisma/migrations/20261007000000_stock_badges/migration.sql`
- `backend/src/lib/stock-badges.ts`
- `backend/src/scripts/verify-stock-badges-migration.mjs`
- `backend/tests/stock-badges.test.ts`
- `src/app/components/ProductBadges.tsx`
- `docs/stock-badges.md`

Modificados:

- `backend/prisma/schema.prisma`
- `backend/src/routes/settings.routes.ts`
- `backend/src/schemas/settings.schema.ts`
- `backend/src/services/settings.service.ts`
- `backend/tests/checkout.integration.test.ts` — inclui a migration no schema isolado do teste.
- `backend/tests/order-cancel.integration.test.ts`
- `backend/tests/settings.integration.test.ts`
- `src/app/App.tsx` — integração dos badges nos cards; carrossel preservado.
- `src/app/lib/store-settings.ts`
- `src/app/manager/Manager.tsx` — passagem das configurações para o card Estoque.
- `src/app/manager/SettingsPage.tsx`
- `src/app/manager/useManagerSettings.ts`
- `src/styles/store-theme.css` — somente estilos adicionais dos badges.
- `tests/carousel.spec.ts` — atualização do mock de settings; testes de zoom preservados.
- `tests/filters.spec.ts` — testes dos badges; seletores ambíguos corrigidos e expectativa de cor vinculada ao token de marca atual.
- `tests/manager.spec.ts` — atualização do mock de settings.
- `tests/products.test.mjs`
- `tests/settings.spec.ts` — contrato, checkboxes e tolerância para arredondamento subpixel nas verificações existentes.

As alterações anteriores em `src/main.tsx`, `src/styles/index.css`, `src/styles/theme.css`, `tests/toast-helpers.ts` e `docs/store-theme.md` foram preservadas integralmente. O HTML do carrossel foi comparado com o estado inicial desta tarefa e permanece idêntico. A marca `#F4EC03`, o zoom de 1 a 1,08 em 5 segundos e o suporte a movimento reduzido foram mantidos.

## Validação

Resultados aprovados:

- Backend: suíte completa com 111 testes; nova execução focada de settings, cancelamento e regra com 21 testes após os ajustes finais.
- Frontend: 62 testes.
- Playwright: 99 cenários distintos validados em execuções combinadas (65 de catálogo, Settings, conta e Manager, mais 34 de pedidos, carrossel e cores).
- Typecheck, build frontend, build backend e `git diff --check`.
- Migration local: contagens e hashes de todos os campos existentes idênticos nas 13 tabelas.

Os testes usam bancos isolados para não alterar produtos, usuários, pedidos, estoque ou configurações do banco real. A aplicação da migration ao banco real foi a única alteração de dados/schema nessa base durante esta tarefa. Não foi necessário reiniciar fisicamente o PostgreSQL; a persistência foi verificada por leituras do banco e novas sessões.

Os cenários incluem os casos A–I da regra, várias cores, coexistência com badge manual, configurações independentes, threshold, permissões, persistência, navegação por teclado e confirmação/cancelamento. A apresentação foi verificada em 320, 390, 768 e 1440 px, com capturas e verificações de overflow, contraste e geometria.

Sem commit ou push.

Após a correção do posicionamento sobre a fotografia: 62 testes frontend e 39 cenários Playwright de catálogo/carrossel validados, incluindo um cenário de carregamento aprovado na reexecução. Typecheck, build frontend e `git diff --check` aprovados. Os testes verificam badges dentro da imagem, separados dos controles, estáticos e sem alteração da altura dos cards com dois, um ou nenhum badge nas quatro larguras.
