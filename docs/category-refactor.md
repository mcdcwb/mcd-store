# Refatoração de categorias — 4 de outubro de 2026

As categorias passaram a ser entidades persistentes administradas pelo ADMIN. O cadastro, a edição e os filtros usam IDs; renomear uma categoria mantém as associações e a seleção ativa.

## Banco e migração

Migration: `backend/prisma/migrations/20261004000000_dynamic_categories/migration.sql`.

A migration foi aplicada ao banco local com `prisma migrate deploy`. Ela cria `Category`, agrupa os nomes antigos normalizados, preenche `Product.categoryId`, exige a chave estrangeira e só então remove a coluna textual antiga. Tudo ocorre em uma transação. A relação `Product.categoryId → Category.id` usa `ON DELETE RESTRICT`, sem exclusão em cascata de produtos.

Foram identificados e preservados os nomes existentes: `camisetas`, `jaquetas`, `calcas`, `bermudas`, `vestidos` e `calcados`. Os nomes podem ser renomeados no Manager. A normalização considera caixa, espaços e equivalência Unicode NFKC; nomes com acentos diferentes não são automaticamente fundidos.

Como `public` representa público-alvo e não existia publicação no modelo anterior, foi acrescentado `isPublished`, inicialmente `true` para todos os produtos existentes. O formulário inclui “Publicado na loja” e a listagem inclui o filtro de publicação.

Verificação antes/depois, por contagem e hashes SHA-256:

| Dados | Antes | Depois |
| --- | ---: | ---: |
| Produtos | 18 | 18 |
| Cores | 20 | 20 |
| Variantes | 72 | 72 |
| Unidades em estoque | 844 | 844 |
| Categorias persistentes | 0 | 6 |
| Favoritos | 0 | 0 |
| Itens de carrinho | 0 | 0 |
| Usuários | 2 | 2 |
| Administradores | 2 | 2 |
| Endereços | 1 | 1 |

Os hashes dos produtos reconstruídos com a categoria correspondente, cores, variantes, favoritos, carrinhos, contas, endereços e configurações permaneceram iguais. Isso inclui IDs, preços, datas, imagens e cada estoque individual. A conferência também confirmou que todos os produtos possuem categoria e continuam publicados. A migration não executa seed, reset, `db push` ou operações sobre volumes Docker. Nenhum dado real foi criado ou alterado para testar.

O script `backend/src/scripts/verify-category-migration.mjs` grava o registro anterior no diretório temporário do sistema, identificado pelo banco. Sua execução sem argumentos deve ocorrer **antes** da migration; `--after` compara o estado migrado com esse registro.

## Administração e API

Em `/manager/produtos`, “Gerenciar categorias” permite criar, renomear e excluir. Nos formulários de criação e edição, “+ Nova categoria” abre um campo compacto; ao adicionar, a lista atualiza e a categoria criada é selecionada sem recarregar a página. As operações usam feedback Sonner. A exclusão requer confirmação e mostra a mensagem de bloqueio dentro do diálogo quando há produtos associados, inclusive produtos não publicados ou sem estoque.

Nomes são obrigatórios, normalizados e limitados a 80 caracteres pelo backend. A chave única de normalização protege contra duplicidade e requisições concorrentes. O Manager lista também categorias vazias e sem estoque.

| Endpoint | Acesso | Comportamento |
| --- | --- | --- |
| `GET /categorias/disponiveis` | Público | Somente `id` e `name` das categorias com produto publicado e variante com estoque positivo |
| `GET /categorias` | ADMIN | Todas as categorias, com `id`, `name` e `productCount` |
| `POST /categorias` | ADMIN | Criação com `{ name }` |
| `PUT /categorias/:id` | ADMIN | Renomeação com `{ name }` |
| `DELETE /categorias/:id` | ADMIN | Exclusão; retorna 409 se houver produtos associados |
| `GET /produtos` | Público | Produtos publicados com categoria `{ id, name }` |
| `GET /produtos/admin` | ADMIN | Todos os produtos, incluindo os não publicados |

Criar/editar produtos envia `categoryId` e, opcionalmente no backend, `isPublished`. A associação por nome foi substituída no contrato de escrita.

## Header, Aside e atualização

Header desktop, menu mobile e Aside recebem a mesma lista calculada por `catalogCategories` em `src/app/lib/products.ts`, a partir do catálogo público completo, antes dos filtros de público, tamanho e categoria. A função considera publicação e estoque positivo em qualquer variante de qualquer cor. Os nomes vêm dos registros e os valores dos filtros usam IDs.

Quando os dados mudam, a categoria desaparece se perder sua última variante disponível e reaparece com a reposição. Um filtro selecionado que perdeu disponibilidade é limpo; renomeações mantêm a seleção pelo ID. O catálogo atualiza após operações do Manager, ao recuperar foco/visibilidade e a cada 30 segundos enquanto a página está visível. Falhas de atualização preservam o último conjunto recebido e permitem tentar novamente.

## Arquivos criados

- `backend/prisma/migrations/20261004000000_dynamic_categories/migration.sql`
- `backend/src/controllers/category.controller.ts`
- `backend/src/routes/category.routes.ts`
- `backend/src/schemas/category.schema.ts`
- `backend/src/services/category.service.ts`
- `backend/src/scripts/verify-category-migration.mjs`
- `backend/tests/category.integration.test.ts`
- `backend/tests/category-migration.integration.test.ts`
- `backend/tests/helpers/category.ts`
- `src/app/lib/categories.ts`
- `src/app/manager/CategoryEditor.tsx`
- `src/app/manager/CategoryManagement.tsx`
- `tests/categories.spec.ts`
- `docs/category-refactor.md`

## Arquivos alterados

- `backend/prisma/schema.prisma`
- `backend/prisma/seed.ts`
- `backend/src/app.ts`
- `backend/src/controllers/product.controller.ts`
- `backend/src/lib/development-products.ts`
- `backend/src/routes/product.routes.ts`
- `backend/src/schemas/product.schema.ts`
- `backend/src/services/product.service.ts`
- `backend/tests/account.integration.test.ts`
- `backend/tests/authorization.integration.test.ts`
- `backend/tests/carousel.integration.test.ts`
- `backend/tests/color-migration.integration.test.ts`
- `backend/tests/product-seed.integration.test.ts`
- `backend/tests/product.integration.test.ts`
- `backend/tests/shopping.integration.test.ts`
- `playwright.config.ts`
- `src/app/App.tsx`
- `src/app/hooks/useProducts.ts`
- `src/app/lib/products.ts`
- `src/app/manager/Manager.tsx`
- `src/app/manager/ProductForm.tsx`
- `src/app/manager/ProductList.tsx`
- `src/app/manager/api.ts`
- `src/app/manager/products.ts`
- `src/app/manager/useManagerProducts.ts`
- `tests/carousel.spec.ts`
- `tests/colors.spec.ts`
- `tests/cooldown.spec.ts`
- `tests/filters.spec.ts`
- `tests/manager.spec.ts`
- `tests/manager.test.mjs`
- `tests/products.test.mjs`
- `tests/session-tabs.spec.ts`
- `tests/settings.spec.ts`
- `tests/shopping.spec.ts`

O Prisma Client foi regenerado na pasta já ignorada pelo Git. Os dados de demonstração continuam definidos no seed; essa lista não controla as categorias aceitas pelo sistema.

## Validações

- `npm test`: 55 testes de frontend passaram.
- `node tests/helpers/run-isolated.mjs`, em `backend`: 72 testes de backend passaram em banco temporário, criado e removido pelo executor existente.
- Playwright em bancos temporários: 90 cenários distintos passaram nas rodadas de categorias, filtros, Manager, cores, configurações, uploads simulados, carrossel, carrinho e sessões entre abas. Os casos corrigidos foram reexecutados com sucesso. Dois cenários de upload real Cloudinary foram ignorados por serem opt-in; nenhum upload remoto foi executado.
- TypeScript frontend (`npm run typecheck`) e backend (`npx tsc --noEmit`): passaram.
- Build frontend (`npm run build`) e backend (`npm run build`): passaram.
- `git diff --check`: passou.
- `prisma generate`: passou.
- `prisma migrate status`: banco atualizado, sem migrations pendentes.
- Conferência antes/depois do banco: passou, sem perda de dados.

Não houve commit ou push.

O gerenciamento também está disponível em Configurações. Veja a [melhoria da seção de categorias](categories-settings.md) para a contagem administrativa, edição inline e validações desta etapa.
