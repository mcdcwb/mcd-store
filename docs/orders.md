# Fundação de pedidos

## Modelagem e histórico

`Order` possui ID interno, número público único, sequência global única, proprietário
USER, status, método de recebimento, nome do cliente, snapshots JSON de endereço,
total Decimal(18,2), timestamps, chave de idempotência, hash da requisição e texto/link
do WhatsApp originalmente produzido. `OrderItem` possui nome do produto, cor,
tamanho, quantidade, preço unitário e subtotal Decimal(18,2).

Os valores vêm do Product.price Decimal existente, arredondado para centavos com
ROUND_HALF_UP. Cálculos usam inteiros seguros em centavos e persistência Decimal;
não há cálculo financeiro com multiplicação de valores fracionários em float.

DELIVERY guarda os sete campos reais de UserAddress: cep, street, number,
complement, neighborhood, city, state. PICKUP guarda apenas o endereço comercial
de StoreSettings, útil para preservar o local combinado; deliveryAddress fica null.
Alterar nome, preço, cor, tamanho ou endereço não altera esses snapshots.

Não duplicamos productId/colorId: a identidade necessária para baixa é variantId.
A relação opcional com ProductVariant usa SET NULL na exclusão; originalVariantId
preserva o ID técnico histórico. Excluir produto/cor/variante mantém os itens,
e uma variante excluída impede confirmação com conflito de disponibilidade zero.
O proprietário usa RESTRICT para evitar exclusão acidental do histórico.

## Número e concorrência

Formato AAMMNNNN para as primeiras 9.999 sequências (exemplo 26100001); acima
disso, o sufixo cresce (sequência 10000 em outubro/2026: 261010000).
OrderCounter contém uma única linha id=1. `UPDATE ... SET value = value + 1
WHERE value < 2147483647 RETURNING value` aloca o próximo valor na mesma transação
que cria o pedido. O PostgreSQL serializa updates da linha: usuários distintos não
recebem a mesma sequência. UNIQUE em number e sequence reforça a garantia. Não
usamos MAX+1. Rollback desfaz também o contador. O contador não reinicia com o mês;
seu teto atual é o máximo de INTEGER do PostgreSQL, em vez de 9999. Repetir uma
tentativa já persistida ainda retorna seu resultado.

A data vem de clock_timestamp() do banco após alocação, sendo gravada em createdAt.
AA/MM usa essa mesma data com a constante BUSINESS_TIME_ZONE, centralizada em
backend/src/config/business.ts: America/Sao_Paulo. Portanto 01/11 02:30 UTC ainda
produz prefixo de outubro (31/10 23:30 na loja).

## API e idempotência

`GET /checkout` continua sendo conferência USER e não escreve dados.
`POST /checkout/whatsapp` foi evoluído: requer idempotencyKey UUID, fulfillmentMethod,
reviewKey e reviewedContext. Zod rejeita campos extras, inclusive preços e userId.
O servidor usa exclusivamente o carrinho do USER autenticado. ADMIN recebe 403;
GUEST recebe 401. Estoque, publicação, preços, endereço e contato são revalidados.

A criação bloqueia a linha User com FOR UPDATE e usa ReadCommitted para enxergar
a tentativa anterior após esperar por concorrentes. UNIQUE(userId,idempotencyKey)
reforça a proteção. A mesma chave e payload devolvem o mesmo pedido/link/mensagem;
mesma chave com dados diferentes recebe 409. Chave nova representa nova tentativa.
O hash usa campos validados em ordem determinística, não a ordem de chaves enviada.
O replay não depende do carrinho ou endereço atual e nunca faz nova baixa.

No frontend, uma UUID fica em memória por seleção conferida. Falha de rede e retry
mantêm a chave. Seleção diferente ou ação explícita "Conferir dados novamente"
inicia outra tentativa. Cliques enquanto há requisição ficam bloqueados. Reabrir a
página inicia uma tentativa nova; a chave não representa deduplicação indefinida do
carrinho. Uma resposta perdida pode ser recuperada reenviando a mesma chave via API.

Resposta: `{ order: { id, number, status }, url, message }`. Não expõe hash,
credenciais ou os snapshots residenciais em campos adicionais.

## Status e confirmação

Estados persistentes: PENDING_CONFIRMATION (inicial obrigatório), PREPARING,
READY_OR_SHIPPED, COMPLETED, CANCELLED. O ciclo normal segue PENDING_CONFIRMATION → PREPARING →
READY_OR_SHIPPED → COMPLETED.

`POST /orders/:id/confirm`, corpo vazio `{}`, é ADMIN-only. USER recebe 403,
GUEST 401, ID/corpo inválido 400, inexistente 404 e status incompatível 409.
Não há endpoint genérico para alteração de status.

A transação ReadCommitted bloqueia primeiro Order com FOR UPDATE. A segunda
confirmação concorrente espera e depois encontra o status atualizado, retornando
409 sem baixa adicional. As variantes são bloqueadas por ID crescente para reduzir
deadlocks. Todas as quantidades são revalidadas antes de escrever; os updates ainda
exigem stock >= quantity e usam decrement atômico. O status muda dentro da mesma
transação. Qualquer falha desfaz todas as baixas e mantém o pedido pendente.

Dois pedidos disputando a última unidade esperam pelo mesmo bloqueio; só um confirma.
Conflitos retornam `{ error, conflicts: [{ variantId, productName, colorName, size,
requested, available }] }`, descrições dos snapshots e estoque da variante real.
Itens que referenciam a mesma variante são somados antes de validar/descontar.
Bloqueios e transações seguem as garantias documentadas pelo
[PostgreSQL](https://www.postgresql.org/docs/current/sql-select.html).

## Estoque e escopo

Criar pedido, conferir checkout e abrir WhatsApp NÃO reservam nem reduzem estoque.
SOMENTE a confirmação ADMIN reduz estoque nesta funcionalidade. O carrinho não é
limpo. Abrir WhatsApp não confirma venda nem envia automaticamente uma mensagem.

A etapa seguinte adicionou Manager/Pedidos, listagem, busca, filtros e UI de
confirmação, avanço normal e cancelamento, descritos em
[Manager → Pedidos](manager-orders.md). Ficam adiados rastreamento, frete, gateway,
pagamentos, reserva e reabertura de pedidos terminais.

`POST /orders/:id/cancel` aceita somente `{ expectedStatus }` com
PENDING_CONFIRMATION, PREPARING ou READY_OR_SHIPPED. É ADMIN-only. Pedido pendente
vira CANCELLED sem tocar no estoque. Pedido confirmado/em envio vira CANCELLED
com incremento das quantidades por variante original, na mesma transação com
lock do pedido e das variantes. COMPLETED e CANCELLED não podem cancelar.
Estado esperado divergente retorna 409; corpo/ID inválido 400; inexistente 404.

A relação OrderItem.variant usa SET NULL: excluir produto/cor/variante preserva
snapshots, mas impede repor aquela variante em um pedido confirmado. Nesse caso
o cancelamento retorna 409 com mensagem útil e rollback completo, sem reposição
parcial. Não procura substituta por nome, cor ou tamanho e não recria variantes.
Pedidos pendentes podem cancelar mesmo após exclusão, pois não precisam repor.
Estoque atual é incrementado; alterações posteriores de estoque não são
substituídas por snapshots. Quantidades da mesma variante são somadas e o limite
Int do estoque é validado. Falha em qualquer item desfaz tudo.

## Exemplos ilustrativos (IDs e dados não são inseridos no banco local)

Order: `{ id: 1, number: "26100001", sequence: 1, userId: 7,
status: "PENDING_CONFIRMATION", fulfillmentMethod: "DELIVERY", customerName:
"Luan Machado", total: "129.00", deliveryAddress: { street: "Rua Exemplo",
number: "123", complement: "", neighborhood: "Bairro", city: "Curitiba",
state: "PR", cep: "80000000" }, pickupAddress: null }`.

OrderItem: `{ id: 1, orderId: 1, variantId: 42, originalVariantId: 42,
productName: "Camiseta Oversized Yeshua", colorName: "Branco", size: "GG",
quantity: 1, unitPrice: "129.00", subtotal: "129.00" }`.

Mensagem exata desse exemplo:

```text
Olá, meu nome é Luan Machado.

Pedido: *#26100001*

Este é o meu pedido:

- Qtd: 1x Camiseta Oversized Yeshua.
Cor: *Branco*
Tamanho: *GG*
Preço: R$129,00.

Precisa de entrega? *Sim*.

Endereço: Rua Exemplo, 123 · Bairro · Curitiba - PR · CEP 80000-000.

Valor Total de produtos: *R$129,00*.
```

## Migration e validação

Migration incremental: 20261006000000_order_foundation. Cria somente as tabelas,
enums, índices, referências e constraints novos. Nenhuma migration antiga é editada.
Prisma permanece 7.9.1. O script src/scripts/verify-order-migration.mjs aplica migrate
deploy e compara contagens e hashes de todas as linhas das tabelas preexistentes,
sem imprimir dados. Executá-lo com a aplicação ociosa evita mudanças concorrentes.

Testes de backend/navegador usam tests/helpers/run-isolated.mjs com bancos
temporários mcd_store_test_*. Os testes não usam o banco real. Cobrem números/timezone,
limite, usuários concorrentes, snapshots, autorização, replay, baixa parcial,
disputa de última unidade e confirmação duplicada inclusive simultânea.
