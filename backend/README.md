# Backend — MCD Store

API da loja, implementada com Node.js, Express 5, TypeScript, Prisma 7 e PostgreSQL. O backend valida as entradas, aplica autorização por conta e perfil e persiste catálogo, estoque, contas, carrinhos, favoritos, configurações e pedidos.

## Requisitos e instalação

Execute estes comandos na pasta `backend/`:

```sh
npm ci
```

É necessário Node.js/npm compatível com as dependências do projeto e um PostgreSQL local exclusivo para executar a API nesta cópia. Os manifests não fixam a versão do Node. `backend/.env.example` é apenas documentação ilustrativa; a aplicação, Prisma, scripts e testes não carregam arquivos `.env`. Forneça as variáveis explicitamente no ambiente do processo. Em execução local, `DATABASE_URL` deve apontar para PostgreSQL local em `127.0.0.1` e banco `mcd_store_demo`; em testes, o executor cria uma base `mcd_store_test_<32 hex>`.

| Variável | Uso |
| --- | --- |
| `DATABASE_URL` | Conexão PostgreSQL fornecida explicitamente no ambiente do processo. Para desenvolvimento local, use `127.0.0.1` e o banco `mcd_store_demo`. |
| `JWT_SECRET` | Segredo de 32 bytes em 64 caracteres hexadecimais; obrigatório ao criar a aplicação. |
| `FRONTEND_ORIGIN` | Lista opcional de origens frontend permitidas pelo CORS, separadas por vírgula. Use origens completas, sem barra final. |
| `PORT` | Porta HTTP; padrão local `3000`. |
| `NODE_ENV` | Modo da aplicação. Origens locais adicionais de CORS são habilitadas fora de `production`. |
| `MCD_DEMO_ALLOW_REMOTE_DATABASE` | Opt-in exigido pelo cliente Prisma e pela configuração Prisma para banco remoto em `production`. Não habilite para desenvolvimento, testes ou executor de banco temporário; use somente após configurar e revisar o banco próprio da demonstração. |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Credenciais necessárias para upload remoto de imagens; opcionais para iniciar a API. |

Gere um segredo JWT local sem reutilizar o exemplo:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

As credenciais Cloudinary e o segredo JWT pertencem apenas ao ambiente backend. Qualquer variável `VITE_*` é pública no bundle do frontend.

## Banco de dados e migrations

Para os comandos locais abaixo, forneça `DATABASE_URL` explicitamente, use `NODE_ENV` ausente ou `development` e confirme que o banco PostgreSQL local `mcd_store_demo` existe. Não aponte esses comandos para bancos compartilhados.

O schema fica em `prisma/schema.prisma`; migrations versionadas ficam em `prisma/migrations/`. Para preparar o banco local exclusivo `mcd_store_demo`, forneça `DATABASE_URL` explicitamente no processo e execute:

```sh
npx prisma migrate deploy
npx prisma generate
```

`npx prisma migrate deploy` altera o schema do banco indicado por `DATABASE_URL`; use-o somente para o banco local `mcd_store_demo` nesta cópia. `npx prisma generate` gera o cliente Prisma e também exige uma `DATABASE_URL` permitida pela configuração, mas não aplica migrations. A aplicação não executa migrations ao iniciar. Não use estas instruções com bancos compartilhados ou da loja original.

O modelo de catálogo é `Product → ProductColor → ProductVariant`: preço e informações gerais pertencem ao produto; imagens, nome/valor de cor pertencem à cor; tamanho e estoque pertencem à variante daquela cor. Carrinho e pedidos referenciam variantes. Outras entidades persistem categorias, contas, endereço, favoritos, configurações da loja, estados e histórico operacional de pedidos.

Para popular o catálogo fictício de desenvolvimento, existe `npm run db:seed` (na pasta `backend/`). O comando exige `DATABASE_URL` explícita apontando para `localhost`, `127.0.0.1` ou `::1`, banco `mcd_store_demo`, e `NODE_ENV` ausente ou em modo local (`development`); falha em `test` ou `production`. Cada execução substitui somente produtos identificados pelo marcador do seed; pode criar categorias fictícias que estejam faltando, mas não altera outros produtos, contas ou administradores. A base deve existir e ter as migrations aplicadas antes do seed.

## Executar e compilar

```sh
npm run dev       # servidor de desenvolvimento com reinício por alteração
npm run build     # gera cliente Prisma e compila TypeScript para dist/
npm start         # inicia dist/server.js após o build
```

O servidor escuta em `0.0.0.0`, usando `PORT` ou `3000`. A rota `GET /` é um health check que consulta o PostgreSQL; ela não substitui monitoramento externo.

## API e fluxos

As rotas são montadas em `src/app.ts`. Os caminhos abaixo são relativos à raiz da API; no frontend local, o Vite encaminha `/api/*` removendo o prefixo `/api`.

| Grupo | Caminhos principais | Acesso |
| --- | --- | --- |
| Autenticação | `POST /auth/register`, `POST /auth/login`, `GET /auth/me` | Cadastro e login públicos; `/me` exige Bearer JWT válido. Registro público cria clientes. |
| Catálogo | `GET /produtos`, `GET /produtos/carrossel`, `/produtos/admin`, `POST /produtos`, `PUT /produtos/:id`, `DELETE /produtos/:id`, `PATCH /produtos/:id/carrossel` | Leituras públicas indicadas; operações administrativas exigem ADMIN ativo. |
| Categorias | `GET /categorias/disponiveis`, `GET/POST /categorias`, `PUT/DELETE /categorias/:id` | Lista disponível pública; gerenciamento exige ADMIN. |
| Conta | `GET/PATCH /conta`, `PUT /conta/senha`; caminhos `/conta/admin` e `/conta/admin/senha` | Rotas separadas para cliente e administrador autenticados. |
| Favoritos e carrinho | `/favoritos`, `/carrinho` e subrotas de item/conferência/sincronização | Exigem autenticação; carrinho é exclusivo de USER. |
| Checkout | `GET /checkout`, `POST /checkout/whatsapp` | USER autenticado. Revisa dados/estoque e prepara pedido/mensagem para WhatsApp; sem cobrança online. |
| Pedidos | `GET /orders/mine`; demais listagem, relatórios, detalhes e operações em `/orders` e `/orders/:id/*` | `/mine` é exclusivo de USER; operações de gestão exigem ADMIN. |
| Configurações | `GET /settings/public`; `/settings`, `/settings/store` | Leitura pública limitada; leitura/edição administrativa exige ADMIN. |
| Imagens | `POST /uploads/produtos` | ADMIN autenticado; depende de Cloudinary configurado. |

Envie o token nas rotas protegidas como `Authorization: Bearer <token>`. O backend emite JWT HS256 para USER e ADMIN com validade fixa de 30 dias e verifica assinatura, emissor, público, expiração, perfil e estado da conta. Não há refresh token nem revogação individual; logout no frontend remove a sessão local, e a desativação/exclusão da conta bloqueia as próximas requisições autenticadas.

### Limites e proteções HTTP

- Helmet adiciona cabeçalhos de segurança; CSP e COEP estão desativados na configuração atual.
- `express.json()` aceita até 1 MiB. JSON malformado retorna 400 e corpo excessivo retorna 413 sem detalhes internos.
- CORS permite origens listadas em `FRONTEND_ORIGIN`; em ambiente diferente de produção, também permite origens locais de desenvolvimento definidas no código.
- Login limita falhas a 10 por IP em 15 minutos; cadastro limita requisições a 10 por IP no período; senha e upload têm limites adicionais por conta.
- Novas finalizações em `POST /checkout/whatsapp` são limitadas a 20 por conta a cada 15 minutos. Respostas de falha não consomem o limite (`skipFailedRequests`). Recuperar pedido existente com chave de idempotência vinculada à mesma conta não conta como nova finalização.
- Os limitadores usam memória do processo: reiniciar limpa as contagens e processos/instâncias diferentes não compartilham estado. O código não configura armazenamento distribuído nem comprova comportamento da hospedagem. O Express está configurado para confiar em um proxy; valide a topologia de proxy da implantação antes de depender de limites por IP.

Logs HTTP e erros usam JSON com campos permitidos e request ID; corpo, query string, credenciais e objetos de erro completos não devem ser enviados ao logger. Erros inesperados recebem resposta genérica em produção; respostas de domínio mantêm seus contratos definidos pelos handlers.

### Upload

`POST /uploads/produtos` recebe um único JPEG, PNG ou WebP de até 5 MiB no campo multipart `file`. O arquivo é processado por Cloudinary; o banco armazena a URL. O buffer é mantido temporariamente em memória. A aplicação não remove automaticamente assets remotos quando uma imagem é retirada do catálogo, pois uma URL pode continuar referenciada.

## Administrador

O comando `admin:create` exige que `DATABASE_URL` esteja definido explicitamente para o banco local existente `mcd_store_demo`, com migrations aplicadas; ele não carrega arquivos `.env`.

Não existe cadastro administrativo público. Configure `ADMIN_EMAIL` e `ADMIN_PASSWORD` apenas no processo local e execute:

```sh
npm run admin:create
```

A senha precisa ter de 5 a 128 caracteres e é armazenada como hash Argon2id. E-mail deve ser único, sem distinção de maiúsculas/minúsculas. No PowerShell, uma forma de fornecer a senha interativamente e removê-la do ambiente do processo ao final é:

```powershell
$adminCredential = Get-Credential -Message "E-mail e senha do administrador"
$env:ADMIN_EMAIL = $adminCredential.UserName
$env:ADMIN_PASSWORD = $adminCredential.GetNetworkCredential().Password
try {
    npm run admin:create
} finally {
    Remove-Item Env:ADMIN_EMAIL, Env:ADMIN_PASSWORD
    $adminCredential = $null
}
```

## Testes

`npm test` na raiz executa testes unitários do frontend. Para os testes backend de integração (`npm test` na pasta `backend/`) e navegador (`npm run test:e2e` na raiz), é necessário um PostgreSQL local em `127.0.0.1`, banco base `mcd_store_demo`, e usuário com permissão `CREATEDB`. O executor cria um banco aleatório `mcd_store_test_<32 hex>`, aplica nele as migrations, roda os testes e tenta remover somente esse banco se a criação foi confirmada.

`DATABASE_URL` deve ser fornecida explicitamente no ambiente do processo; arquivos `.env` não são carregados. Antes de habilitar o executor, confirme que `127.0.0.1` chega ao PostgreSQL local esperado e não a um túnel ou encaminhamento de porta. O endereço local não permite detectar um túnel com certeza.

O executor exige também a autorização específica `MCD_ALLOW_LOCAL_TEST_DATABASE_CREATE_DROP=1` e recusa `NODE_ENV=production`. A autorização permite somente que `run-isolated.mjs` tente criar e remover seu banco temporário após validar host e nome da base. Não é uma autorização de conexão remota e não é usada pela aplicação, Prisma ou seed. Na CI, a variável é definida apenas nas etapas de testes backend e navegador do workflow, que usam o serviço PostgreSQL local em `127.0.0.1` e a base `mcd_store_ci`. Para execução manual no PowerShell, defina-a deliberadamente apenas no shell usado para o teste e remova-a ao terminar:

```powershell
$env:MCD_ALLOW_LOCAL_TEST_DATABASE_CREATE_DROP = "1"
try {
    npm test
} finally {
    Remove-Item Env:MCD_ALLOW_LOCAL_TEST_DATABASE_CREATE_DROP
}
```

Antes desse comando, forneça `DATABASE_URL` explicitamente nesse processo para a base local `mcd_store_demo`. Não use esta autorização com um host encaminhado por túnel. Sem a variável, ou com `NODE_ENV=production`, o executor recusa iniciar antes de conectar.

Para a suíte backend completa, execute a partir desta pasta:

```sh
npm test
```

O helper aceita arquivos específicos após o script. Para integração de navegador com banco isolado, use o mesmo helper:

```sh
node tests/helpers/run-isolated.mjs browser
node tests/helpers/run-isolated.mjs browser tests/checkout.spec.ts
```

O comando de navegador é `npm run test:e2e` na raiz ou `node tests/helpers/run-isolated.mjs browser` nesta pasta. Ambos usam o executor isolado, preparam catálogo no banco temporário e executam Playwright nesse mesmo banco. Não execute `playwright test` diretamente: os fixtures exigem o ambiente isolado e falham sem ele.

`http-security.test.ts` importa a aplicação e, quando executado diretamente com `NODE_ENV=test`, o guard em `src/lib/prisma.ts` exige uma `DATABASE_URL` local cujo nome de banco corresponda a `mcd_store_test_<32 hex>`. `mcd_store_demo` não é aceito nesse modo. Não configure manualmente uma base compartilhada para contornar essa proteção; prefira executar o teste pelo helper isolado, que cria a base temporária:

```sh
npm test -- tests/http-security.test.ts tests/error-handling.test.ts
```

O build do backend é `npm run build`; requer `DATABASE_URL` explícita local permitida para gerar o cliente Prisma, sem precisar abrir uma conexão ao banco. Os testes de integração aplicam migrations somente ao banco aleatório criado pelo helper. Se o processo for encerrado abruptamente ou a remoção falhar, a base temporária pode permanecer; confira o nome exato antes de qualquer limpeza manual e não remova outras bases.

## Documentos relacionados

- [README principal](../README.md): instalação e fluxos do produto.
- `prisma/schema.prisma`: modelo relacional atual.
- `prisma/migrations/`: histórico de alterações do schema.
- `tests/helpers/run-isolated.mjs`: implementação do banco descartável.
