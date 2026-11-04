# Manager → Pedidos

## Cancelamento administrativo

`POST /orders/:id/cancel` requer ADMIN e corpo strict
`{ "expectedStatus": "PENDING_CONFIRMATION" | "PREPARING" | "READY_OR_SHIPPED" }`.
O corpo JSON contém exatamente um desses valores. Não aceita destino, userId ou
campos extras. Retorna `{ id, number, status: "CANCELLED", updatedAt }`.
GUEST recebe 401, USER 403, ID/corpo inválido 400, inexistente 404 e estado
incompatível/alterado 409. COMPLETED e CANCELLED são terminais.

A transação ReadCommitted bloqueia Order com FOR UPDATE antes de ler status e
itens, no mesmo padrão de `/confirm`. O expectedStatus deve corresponder ao estado
real após esperar o lock. Uma segunda chamada concorrente/repetida encontra
CANCELLED e recebe 409, sem nova reposição. `/advance` também serializa na mesma
linha através de seu UPDATE condicional. Corridas entre cancelar, confirmar e
avançar não combinam operações com estados desatualizados.

PENDING_CONFIRMATION apenas muda de status, sem ler/bloquear/escrever variantes.
PREPARING e READY_OR_SHIPPED somam OrderItem.quantity por variantId e verificam
a identidade originalVariantId. Bloqueiam variantes em ordem crescente de ID e
usam incremento atômico sobre o estoque atual. Itens repetidos repõem a soma.
Nome/preço/cor/tamanho editados não alteram o destino da reposição. Todos os
incrementos e a mudança de status pertencem à mesma transação; qualquer falha
reverte tudo, inclusive incrementos já executados. O limite Int de stock também
é protegido, retornando conflito em vez de reposição parcial.

Limitação real do schema: excluir produto, cor ou variante aplica SET NULL nos
OrderItems. Um pedido confirmado que perdeu uma variante não pode cancelar por
este endpoint: retorna 409, conserva status e estoque, e informa o item afetado.
Não recria variante nem tenta substituir por dados editáveis. O pedido pendente
pode cancelar nessa situação porque nunca teve baixa. Não foi necessária migration.

“Cancelar pedido” aparece apenas nos três estados permitidos, com estilo
destrutivo e identificação textual. O AlertDialog informa o número e a consequência
de estoque; “Voltar” fecha sem executar. Durante o POST, mostra “Cancelando...”,
desabilita as ações e bloqueia submits por ref. Preserva foco e navegação por teclado.
Sucesso fecha a confirmação, atualiza detalhes e lista, exibe toast e mantém busca,
ordenação, página e filtro. Se houve reposição, também recarrega o catálogo Manager.
Erros exibem a mensagem da API e relêem o status antes de oferecer nova tentativa;
resposta perdida com cancelamento já concluído também atualiza o catálogo.

Não altera snapshots, carrinho, favoritos, checkout, WhatsApp ou numeração.
`confirmOrder` e `advanceOrder` permanecem intactas: somente `/confirm` baixa
estoque; `/advance` não altera estoque e não aceita CANCELLED.

Testes usam apenas bancos mcd_store_test_* e fixtures próprias. A integração cobre
os três estados em DELIVERY/PICKUP, reposição exata, itens repetidos, estoque
atualizado depois da compra, snapshots, autorização, contrato, estados terminais,
concorrência, disputa com confirmação/avanço, remoção física e rollback após
falha na segunda variante. Playwright executa cancelamentos reais e verifica
dialog, loading, submit único, toast, recuperação após outro ADMIN, filtros,
estoque e ausência de ações terminais em 320/390/768/1440px.

Validação do cancelamento: 28 testes backend relacionados, 107 testes na suíte
backend completa, 61 testes frontend e 19 cenários Playwright de Pedidos passaram.
Typecheck, builds frontend/backend e `git diff --check` passaram. As funções
confirmOrder e advanceOrder foram comparadas com HEAD e permanecem idênticas.
Schema, migrations, numeração, timezone e checkout não receberam alterações.

## Ciclo normal de status

`POST /orders/:id/advance` é ADMIN-only (GUEST 401, USER 403). Corpo obrigatório
e strict: `{ "expectedStatus": "PREPARING" }` ou
`{ "expectedStatus": "READY_OR_SHIPPED" }`. O cliente informa o estado observado,
não o destino. O servidor determina PREPARING → READY_OR_SHIPPED ou
READY_OR_SHIPPED → COMPLETED. Nenhum outro estado ou campo é aceito (400).
ID inválido retorna 400, pedido inexistente 404, estado incompatível/alterado 409.
Resposta: `{ id, number, status, updatedAt }`.

O update condicional por ID e status ocorre em uma transação ReadCommitted.
PostgreSQL reavalia a condição após aguardar o update concorrente: só uma chamada
com o mesmo expectedStatus vence. A outra retorna 409, mesmo se chegar após o
commit. Repetir o mesmo corpo nunca avança novamente. Uma nova etapa exige uma
nova confirmação visual com o novo estado observado. Não há acesso a estoque,
reserva ou revalidação de variantes nesta operação.

PENDING_CONFIRMATION continua usando exclusivamente `/confirm`, cuja transação
e baixa de estoque permanecem intactas. CANCELLED e COMPLETED não avançam.
O cancelamento usa uma operação separada descrita abaixo. Não há histórico,
alteração de schema ou nova migration.

Na listagem e nos detalhes, READY_OR_SHIPPED aparece como “Enviado” em DELIVERY
e “Pronto para retirada” em PICKUP. O filtro mantém “Enviado / Pronto”. PREPARING
oferece “Marcar como enviado” ou “Marcar como pronto para retirada”; o estado
seguinte oferece “Finalizar pedido”. Todas as ações usam o AlertDialog existente,
proteção de submit por ref, botões desabilitados e feedback “Atualizando...”.
Sucesso atualiza o pedido aberto e recarrega a listagem mantendo os critérios;
o filtro ativo pode remover o pedido da lista. `/confirm` e cancelamento com
reposição recarregam o catálogo de estoque. Erros mantêm a mensagem do servidor e relêem os detalhes
antes de oferecer outra ação, inclusive após conflito ou resposta perdida.

Testes adicionais cobrem autorização, contrato strict, etapas inválidas,
concorrência, replay, DELIVERY/PICKUP e estoque zero sem alteração. Playwright
cobre confirmação, submit único, finalização, ausência de ações terminais,
filtros, recuperação após mudança por outro ADMIN e larguras 320/390/768/1440px.

Validação do ciclo normal: 94 testes backend, 60 testes frontend e 14 cenários
Playwright de Pedidos passaram. Typecheck, builds frontend/backend e
`git diff --check` passaram. A função confirmOrder foi comparada com HEAD e
permanece idêntica. A primeira execução ampla teve interferência entre fixtures
(incluindo carrossel); o teste novo passou a usar uma variante própria, e a
execução ampla seguinte passou. O helper isolado agora aceita caminhos de testes
para permitir validações direcionadas, sempre em banco temporário mcd_store_test_*.

A rota `/manager/pedidos` usa a navegação, proteção ADMIN, cards, tokens de cor e
notificações Sonner do Manager existente. Não houve mudança de schema, migration,
numeração ou confirmação transacional de estoque.

## Listagem e API

`GET /orders` é exclusivo ADMIN (GUEST 401, USER 403). Parâmetros Zod strict:

| Parâmetro | Valores / padrão |
| --- | --- |
| search | Texto até 100 caracteres, padrão vazio |
| status | Um dos cinco OrderStatus existentes, opcional |
| sort | date ou number; padrão date |
| direction | asc ou desc; padrão desc |
| page | Inteiro entre 1 e 1.000.000; padrão 1 |
| pageSize | Inteiro entre 1 e 50; padrão 20 |

Parâmetros extras, arrays, enums desconhecidos e limites inválidos retornam 400.
Pesquisa parcial por número (aceita # inicial) ou nome histórico customerName,
case-insensitive para nomes. Status combina com a pesquisa por AND. Número usa
sequence, não comparação textual; data usa createdAt com sequence como desempate.

A resposta é `{ items, total, page, pageSize, totalPages }`. Cada item contém
id, number, sequence, customerName, createdAt, total, fulfillmentMethod, status.
Não inclui endereços, credenciais, chave de idempotência ou hash de checkout.
Contagem e página são lidas na mesma transação RepeatableRead. Página além do
limite retorna a última página disponível; lista vazia informa página 1 de 1.
São duas consultas por página, sem leitura de relações por registro e sem N+1.

## Interface

Pesquisa sem botão, com debounce de 300ms apenas quando o texto muda. Requisições
anteriores são abortadas e respostas antigas ignoradas. Filtro e ordenação são
imediatos. Alterar pesquisa, status ou ordenação volta à primeira página. O padrão
é Todos e pedidos mais recentes primeiro. Setas de Número/Data alternam crescente
e decrescente; trocar o critério começa crescente.

Cards mostram número, cliente, data comercial, valor, Entrega/Retirada e badge com
texto do status. Paginação possui Anterior/Próxima e contagem de páginas/resultados.
Há estados próprios de carregamento, falha com retry e ausência de resultados.
O layout adapta-se a desktop, tablet, 390px e 320px sem tabela horizontal.

O enum vem dos tipos Prisma já existentes. O mapa português é apenas apresentação,
não cria enum paralelo. Datas usam BUSINESS_TIME_ZONE existente e valores Decimal
são formatados por strings/BigInt, sem conversão financeira insegura para float.

## Detalhes e confirmação

`GET /orders/:id` é ADMIN-only e retorna os campos da listagem, updatedAt,
deliveryAddress, pickupAddress e os snapshots dos itens. ID inválido retorna 400;
inexistente, 404. Seleções explícitas omitem campos internos de checkout/segurança.
Não consulta Product nem UserAddress para representar o histórico.

Os detalhes abrem no Dialog Radix existente, com título/descrição acessíveis,
controle de foco e rolagem vertical. DELIVERY mostra deliveryAddress; PICKUP mostra
"Retirada na loja" e pickupAddress. Itens mostram quantidade, produto, cor,
tamanho, preço unitário e subtotal; o total é apenas dos produtos.

Somente PENDING_CONFIRMATION oferece "Confirmar pedido". Antes do POST de confirmação,
AlertDialog exige confirmação explícita e informa a baixa de estoque. Cancelar
fecha o alerta sem enviar requisição. Durante o envio, o botão mostra
"Confirmando...", um ref bloqueia submits repetidos e fechar/navegar pelo Manager
fica impedido.

A interface chama exclusivamente o `POST /orders/:id/confirm` já existente. Sucesso
atualiza os detalhes para o status retornado pelo servidor, oferece a próxima ação, recarrega
a página atual (mantendo filtros), atualiza o catálogo administrativo e exibe toast.
Nenhum decremento ou cálculo de estoque é executado no frontend.

Erros de estoque exibem todos os conflicts retornados, com produto/cor/tamanho,
solicitado e disponível. O status permanece pendente. Erros sem conflicts, inclusive
resposta perdida após commit ou status atualizado por outro ADMIN, causam nova
leitura dos detalhes antes de oferecer outra confirmação. Falhas de leitura têm
retry. Respostas 401/403 usam a revogação de acesso já existente no Manager.

## Escopo e testes

Mantêm-se intactos Order, OrderItem, OrderCounter, enums e timezone; números existentes
mantêm o formato AAMMNNNN e sequências acima de 9999 passam a usar sufixo expandido.
e transação de confirmação. Criar pedido, carrinho, checkout e WhatsApp continuam
sem baixa ou reserva. Somente confirmar como ADMIN baixa estoque.

Ficam adiados pagamento,
frete, rastreamento, editar itens, excluir pedidos e acompanhamento público.

Testes da API verificam autorização, pesquisa, os cinco status, filtros combinados,
quatro ordenações, paginação, parâmetros inválidos e snapshots. Playwright verifica
navegação, busca, filtros, paginação, detalhes, confirmação explícita, submit único,
sucesso, conflitos múltiplos, falhas/retry, vazio, USER e quatro larguras.
Fixtures de banco rodam somente em mcd_store_test_* pelo helper temporário existente.

## Resultado da validação desta etapa

- Backend: 90 testes passaram no banco temporário.
- Frontend: 57 testes passaram.
- Playwright: 115 cenários passaram, incluindo Pedidos, Manager, checkout,
  Configurações, Minha Conta, autenticação, categorias, catálogo, carrinho e favoritos.
- Typecheck, build frontend, build backend e git diff --check passaram.
- Verificação por comparação com HEAD: função confirmOrder e transação de estoque
  permanecem idênticas; schema, migrations, timezone, numeração e checkout sem diff.
- Screenshots de detalhes foram verificados em 320px; testes cobrem também 390px,
  768px e 1440px, com retorno de foco ao botão que abriu o modal.

Na primeira execução backend houve conflito de criação na fixture compartilhada de
categorias; as duas execuções seguintes completas passaram. O teste antigo do
Dashboard também foi alinhado ao título já existente "Total de variantes
(cor/tamanho)". Não houve alteração de comportamento do Dashboard.

Arquivos criados: src/app/manager/OrdersPage.tsx, src/app/manager/orders.ts,
backend/tests/orders.integration.test.ts, backend/tests/helpers/orders-browser-fixture.ts,
tests/orders.spec.ts e docs/manager-orders.md.

Arquivos modificados: backend/src/controllers/order.controller.ts,
backend/src/routes/order.routes.ts, backend/src/schemas/order.schema.ts,
backend/src/services/order.service.ts, src/app/manager/Manager.tsx,
src/app/manager/api.ts, playwright.config.ts, tests/manager.spec.ts,
tests/manager.test.mjs e docs/orders.md.
