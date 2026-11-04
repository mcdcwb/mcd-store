# Checkout por WhatsApp

## Fluxo

O botão do carrinho mantém a intenção de checkout enquanto o visitante faz login
ou cadastro no modal existente. O cadastro mantém o comportamento atual de pedir
login em seguida. Após autenticação como USER, o fluxo espera a sincronização
guest → USER antes de navegar para `/checkout`. Cancelar o modal mantém o carrinho.
ADMIN não pode utilizar a página nem os endpoints de cliente.

A página é selecionada pelo pathname em `App.tsx`, sob o `BrowserRouter` existente.
Ela permite escolher DELIVERY ou PICKUP, conferir itens e abrir o WhatsApp. A
primeira visita começa sem escolha. A edição continua no `CartDrawer` existente.

## Endereços e contato

DELIVERY usa `GET /conta`, incluindo o nome completo e endereço de UserAddress.
Cadastro/alteração continua em `/minha-conta?returnTo=/checkout#address-title`.
A página de conta oferece retorno explícito, inclusive após salvar. Apenas o
destino exato `/checkout` é aceito; URLs externas não são utilizadas.

PICKUP mostra o endereço de `GET /settings/public`, carregado por `useStoreDetails`.
O mesmo hook alimenta footer e botão flutuante. O WhatsApp utiliza o campo existente
de StoreSettings e o helper `whatsappUrl`, com mensagem codificada por URLSearchParams.
Ausência de endereço aplicável, contato ou erro de carregamento bloqueia finalização.

O único rascunho em sessionStorage é `{ userId, method }`, na chave
`mcd-store_checkout_v1`. Nenhum produto, preço ou endereço é persistido ali.
Logout e troca de identidade limpam o rascunho; a escolha é isolada por aba/usuário.

## Conferência e API

- `GET /checkout`: somente USER; lê o carrinho persistido, valida publicação e
  estoque e retorna itens, preços em centavos, subtotais, total, conflitos e
  `reviewKey` da seleção conferida.
- `GET /carrinho/conferencia`: somente USER; leitura sem ajustar quantidades.
- `POST /checkout/whatsapp`: somente USER; recebe método, reviewKey e os dados
  de nome/endereço/contato vistos pelo usuário, exclusivamente para comparação.
  Nunca recebe preços ou quantidades como autoridade. Revalida o carrinho, perfil
  e StoreSettings na transação de criação do pedido e monta a mensagem
  com os valores do banco. Retorna 409 se houver conflito ou informação alterada.
- Mutações do drawer no contexto de checkout usam `?conferencia=1`: mantém a
  validação de estoque da seleção editada sem ajustar silenciosamente outras.
  O comportamento padrão do carrinho fora desse contexto continua preservado.

A conferência atualiza na entrada, ao recuperar foco, periodicamente com a página
visível e após edição no drawer. A validação final detecta alterações mesmo entre
essas atualizações. Conflitos identificam produto, cor, tamanho, quantidade e
disponibilidade; o usuário revisa no carrinho. Preços ou seleções alterados exigem
nova conferência antes de outro clique.

## Valores e mensagem

O servidor converte o Decimal do preço unitário para centavos, arredondando metade
para cima. O subtotal é preço em centavos × quantidade; o total soma subtotais,
com verificação de limites inteiros seguros. O valor apresentado é somente dos
produtos; entrega será combinada pelo atendimento.

A mensagem segue o formato solicitado: nome completo, uma seleção por bloco,
subtotal por seleção, `Precisa de entrega? *Sim*.` ou `*Não*.`, endereço residencial
somente para DELIVERY e `Valor Total de produtos: *R$...*.`. Complemento vazio é
omitido. Acentos e quebras de linha são preservados; caracteres de controle e
marcadores de formatação inseridos em nomes não alteram a estrutura da mensagem.

## Abertura e limites

O clique abre uma aba de preparação para manter o gesto de usuário e evitar
bloqueadores de popups. Só navega ao WhatsApp após validação. Em erro, fecha essa
aba e apresenta o problema na página e no Sonner. Se o navegador bloquear a aba,
informa como permitir a abertura. Cliques repetidos ficam bloqueados; nova abertura
depende de uma nova conferência ou escolha. Troca de sessão durante a validação
impede o encaminhamento de uma resposta antiga.

O fluxo persiste Order/OrderItem antes de retornar o WhatsApp, incluindo número
público e snapshots. A confirmação ADMIN é a única operação que baixa estoque;
checkout continua sem reserva e mantém o carrinho. Veja [fundação de pedidos](orders.md)
para contrato, migration, idempotência e concorrência. Os testes verificam o link e
texto sem enviar mensagem real à loja.

Existe uma migration incremental para pedidos. Execute os testes de banco/navegador pelo helper
`backend/tests/helpers/run-isolated.mjs` para utilizar somente bancos temporários.
