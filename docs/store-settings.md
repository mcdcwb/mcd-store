# Dados comerciais da loja

`StoreSettings` (registro único, ID 1) é a fonte do endereço comercial, WhatsApp e
[dias/horários de funcionamento](business-hours.md).
O endereço do cliente continua exclusivamente em `UserAddress`.

## Armazenamento

Campos opcionais `storeCep`, `storeStreet`, `storeNumber`, `storeComplement`,
`storeNeighborhood`, `storeCity`, `storeState` e `whatsapp`.
O endereço é salvo completo ou removido por inteiro; complemento é opcional.
CEP contém oito dígitos e UF é normalizada para maiúsculas. Não há preenchimento
automático do banco com valores fictícios.

O telefone brasileiro é normalizado em `backend/src/lib/store-contact.ts`,
compartilhado com o frontend: `55` + DDD + número, somente dígitos. Aceita entrada
com ou sem código do país e com formatação. A apresentação e o link WhatsApp
derivam dessa mesma regra, sem duplicar `55`.

## API

- `GET /settings/public`: público, retorna apenas `{ address, whatsapp, businessHours }`.
- Outros métodos em `/settings/public`: 405, sem escrita.
- `GET /settings/store` e `PUT /settings/store`: somente ADMIN.
- PUT recebe address, whatsapp e/ou businessHours e rejeita campos desconhecidos.
  Campos omitidos são preservados. Não altera `lowStockThreshold`.
- `GET /settings` e `PUT /settings`: contrato existente de estoque preservado.

O frontend usa a base `VITE_API_URL`, ou `/api` por padrão.

## Interface

Manager → Configurações → Dados da loja possui formulário independente do limite
de estoque, feedback Sonner e proteção contra submits repetidos. ViaCEP e a
formatação de CEP reutilizam os helpers genéricos de `src/app/lib/address.ts`;
consultas não sobrescrevem campos corrigidos durante a busca.

`useStoreDetails` fornece os dados públicos para consumidores presentes e futuros.
Atualiza ao recuperar foco, a cada 30 segundos com página visível e após salvar.
O footer mostra endereço neutro quando ausente; o telefone e botão WhatsApp ficam
ocultos quando não configurados. Horários são configurados no mesmo formulário e
exibidos no footer por agrupamento de dias consecutivos idênticos. O e-mail permanece
fora do escopo desta configuração.

## Migration e verificação

`20261005000000_store_business_details` somente acrescenta colunas nullable.
Não recria tabelas, altera IDs, estoque nem valores de configurações anteriores.
Aplicar com `prisma migrate deploy`; nunca usar reset para esta alteração.

Testes de banco e navegador devem usar `backend/tests/helpers/run-isolated.mjs`,
que cria e remove apenas um banco temporário com nome aleatório.

Checkout, pedidos, pagamentos, frete e envio de pedidos pelo WhatsApp não fazem
parte desta implementação.
