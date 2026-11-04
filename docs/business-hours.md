# Dias e horários de funcionamento

StoreSettings possui um único campo JSONB não nulo `businessHours`, com as chaves
MONDAY, TUESDAY, WEDNESDAY, THURSDAY, FRIDAY, SATURDAY e SUNDAY. Não foram criadas
tabelas de horários. O tipo TypeScript compartilhado é `Record<WeekDay, DayHours>`.
Um dia aberto guarda `{ isOpen: true, openingTime: "09:00", closingTime: "18:00" }`;
um fechado guarda `{ isOpen: false, openingTime: null, closingTime: null }`.

## Validação e API

Os endpoints existentes foram evoluídos:

- GET /settings/public: público, retorna address, whatsapp e businessHours, sem
  dados administrativos como limite de estoque. Não faz escrita.
- GET /settings/store: mesma representação, exclusivo ADMIN.
- PUT /settings/store: exclusivo ADMIN; aceita businessHours junto dos dados
  comerciais ou isoladamente. Campos omitidos são preservados; null em address
  ou whatsapp continua removendo esses dados. Corpo vazio/campos extras são rejeitados.
- GET/PUT /settings: contrato exclusivo de lowStockThreshold mantido.

Zod exige exatamente os sete dias, boolean real, apenas campos conhecidos e,
quando aberto, abertura/fechamento obrigatórios no formato 24h HH:mm. Valores como
25:00, 12:99, 9:00 ou segundos são rejeitados. Fechamento deve ser estritamente
posterior à abertura, no mesmo dia; horários iguais ou 18:00 → 02:00 são inválidos.
Quando fechado, horários podem ser omitidos ou null e são normalizados para null;
horários não nulos são rejeitados. Uma constraint PostgreSQL reforça o formato
canônico para impedir também escritas JSON inválidas fora da API.

GET retorna sempre os horários persistidos. Clientes antigos podem continuar
salvando só endereço/WhatsApp sem apagar os horários. USER recebe 403 e GUEST 401
nos endpoints administrativos. Erros de validação retornam 400 com caminho do dia
e detalhes em errors. A leitura pública usa Cache-Control: no-store.

## Configurações e footer

Manager → Configurações → Dados da loja agora contém o editor dos sete dias com
checkbox Aberto/Fechado e inputs type=time. Fechado desabilita os horários. O estado
do formulário preserva os horários digitados ao fechar/reabrir, inclusive depois
de salvar na mesma sessão; o backend nunca grava esses horários em dias fechados.
Ao recarregar, dias fechados voltam com horários vazios. Erros mantêm o rascunho e
mostram mensagem inline e Sonner; sucesso usa a notificação positiva já existente.

O mesmo botão "Salvar dados da loja" salva os horários. O evento
store-details-updated atualiza o hook público central useStoreDetails. O footer
consome esse hook e não realiza uma segunda requisição. Não há valores fictícios
de fallback: durante falha/ausência dos dados, mostra horários indisponíveis.

O agrupamento percorre segunda a domingo e junta somente dias consecutivos com
isOpen, openingTime e closingTime idênticos. Dois dias usam "e"; três ou mais usam
"a". Não agrupa circularmente domingo com segunda. Dia fechado interrompe qualquer
grupo de dias abertos. Exemplo com quarta fechada:

```text
Segunda e terça: 09:00 às 18:00
Quarta: Fechado
Quinta e sexta: 09:00 às 18:00
Sábado: 10:00 às 15:00
Domingo: Fechado
```

## Migration e compatibilidade

Migration incremental `20261006010000_store_business_hours` adiciona somente o
campo, seu default e a função/constraint de validação. Mantém todos os campos e
linhas anteriores. O default reproduz o footer anterior: segunda a sexta 09:00–18:00,
sábado 10:00–15:00, domingo fechado. A antiga frase "Domingos e feriados" não era
uma configuração de feriados; esta etapa representa apenas dias da semana.
Nenhuma regra de feriados foi criada.

O script backend/src/scripts/verify-hours-migration.mjs aplica migrate deploy e
compara contagens e hashes SHA-256 de todos os campos antigos, inclusive de
StoreSettings, antes/depois. A coluna nova é excluída dessa comparação por seleção
explícita das colunas preexistentes. Não imprime dados de clientes.

No ambiente local, a migration foi aplicada e as 13 tabelas preexistentes mantiveram
contagens e hashes idênticos. Migrations antigas não foram alteradas. Prisma segue
7.9.1; não houve reset, recriação de banco ou remoção de volumes.

## Escopo e testes

Horários apenas informam o funcionamento no footer. Não bloqueiam checkout,
carrinho ou produtos. Pedidos, numeração, confirmação e baixa de estoque permanecem
intactos. Ficam adiados Aberto agora, contadores, feriados, exceções por data,
expediente noturno, vários períodos no dia e timezone configurável.

Testes backend verificam autorização, leitura pública, HH:mm, formato dos sete
dias, fechamento posterior, dias fechados, compatibilidade e preservação de
configurações. Também verificam a constraint do banco e preservação na migration.
Testes frontend cobrem agrupamento, dias separados, horários nulos e rascunhos.
Playwright usa backend real em banco temporário para editar/salvar/recarregar,
validar envio canônico e refletir os horários no footer, incluindo 320px, 390px,
768px e 1440px, além de falhas de salvamento/leitura pública.

## Arquivos desta etapa

Criados:

- backend/prisma/migrations/20261006010000_store_business_hours/migration.sql
- backend/src/lib/business-hours.ts
- backend/src/schemas/business-hours.schema.ts
- backend/src/scripts/verify-hours-migration.mjs
- src/app/lib/business-hours.ts
- src/app/manager/BusinessHoursFields.tsx
- tests/business-hours.test.mjs
- tests/hours.spec.ts
- docs/business-hours.md

Modificados:

- backend/prisma/schema.prisma
- backend/src/routes/settings.routes.ts
- backend/src/schemas/settings.schema.ts
- backend/src/services/settings.service.ts
- backend/tests/settings.integration.test.ts
- backend/tests/checkout.integration.test.ts
- src/app/lib/store-settings.ts
- src/app/manager/StoreDetailsForm.tsx
- src/app/App.tsx
- src/app/components/AccountMenu.tsx
- package.json
- playwright.config.ts
- docs/store-settings.md

AccountMenu limita visualmente o nome em telas menores que 390px para corrigir
overflow preexistente com nomes longos na vitrine autenticada; o texto acessível
permanece completo. O teste de checkout passou a contar pedidos do usuário da
própria fixture, evitando interferência dos testes concorrentes de pedidos.
Nenhuma regra de checkout ou pedidos foi alterada.

Validação final: 93 testes backend, 59 testes frontend e 86 cenários Playwright
aprovados. Typecheck, build frontend, build backend e git diff --check aprovados.
A regressão de navegador inclui autenticação USER/ADMIN, categorias, produtos,
estoque, checkout, pedidos e configurações comerciais. Testes de integração e
Playwright executaram em bancos temporários isolados.
