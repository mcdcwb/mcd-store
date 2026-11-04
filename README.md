# MCD Store

MCD Store é uma loja virtual demonstrativa de vestuário. O frontend React apresenta o catálogo e os fluxos de compra; uma API Express mantém contas, catálogo, carrinhos, favoritos, pedidos e configurações da loja em PostgreSQL.

## Funcionalidades

- Catálogo público com categorias, filtros, detalhes, cores, imagens, tamanhos, estoque, destaques e carrossel.
- Cadastro público de clientes, login compartilhado entre clientes e administradores e páginas de conta.
- Favoritos e carrinho de clientes persistidos por conta. Visitantes podem manter um carrinho local, que é mesclado ao da conta no login conforme as regras implementadas.
- Revisão de checkout e criação idempotente de pedido para contato com a loja pelo WhatsApp. O projeto não integra pagamento online.
- Área administrativa para produtos, variantes e imagens, categorias, configurações da loja e operação/relatórios de pedidos.
- Endereço de cliente com consulta opcional ao ViaCEP.

O repositório contém um frontend Vite/React/TypeScript na raiz e um backend Express 5/TypeScript com Prisma e PostgreSQL em `backend/`. O modelo de produto organiza variantes por cor; estoque é mantido nas variantes. Consulte [backend/README.md](backend/README.md) para os contratos da API, banco e testes do servidor.

## Requisitos

- Node.js e npm. Os `package.json` não fixam uma versão do Node; use uma versão compatível com Vite, Playwright e Prisma.
- PostgreSQL para executar o backend e os testes de integração/navegador.
- Para desenvolvimento local completo, dependências instaladas separadamente na raiz e em `backend/`.

## Instalação e execução local

Na raiz, instale as dependências do frontend e configure a URL pública da API, se necessário:

```sh
npm ci
```

O arquivo `.env.example` documenta `VITE_API_URL`; seu padrão é `/api`. Em desenvolvimento, o Vite encaminha `/api/*` ao backend em `http://127.0.0.1:3000`. `API_PROXY_TARGET` permite trocar o destino do proxy. Não use segredos do servidor em variáveis `VITE_*`: elas são incorporadas ao código entregue ao navegador.

Configure e inicie o backend conforme [backend/README.md](backend/README.md), com PostgreSQL local e migrations aplicadas. Depois, na raiz:

```sh
npm run dev
```

O Vite mostra o endereço local no terminal. A configuração `vercel.json` define o build Vite e o rewrite de rotas SPA; isso não configura variáveis de ambiente nem publica o serviço.

## Configuração

Frontend: `VITE_API_URL` é opcional e aponta para a base da API. O exemplo `/api` usa o proxy local.

Backend: `backend/.env.example` é ilustrativo e não é carregado. Passe `DATABASE_URL` explicitamente ao processo; em modo local, o backend aceita somente PostgreSQL local e banco `mcd_store_demo`. `JWT_SECRET` deve ser fornecido separadamente como 32 bytes aleatórios codificados em 64 caracteres hexadecimais. `FRONTEND_ORIGIN` aceita uma ou mais origens para CORS. `PORT` é opcional (padrão 3000); `NODE_ENV` seleciona o modo. As variáveis Cloudinary são necessárias para uploads remotos.

Use valores fictícios nos exemplos e mantenha `.env` fora do controle de versão. Não configure `DATABASE_URL`, `JWT_SECRET` ou credenciais Cloudinary no frontend. O código não determina os valores dos painéis de hospedagem: confirme-os diretamente na configuração de cada ambiente antes de publicar.

## Autenticação e áreas da loja

O cadastro público cria contas de cliente. Contas administrativas são criadas pelo comando descrito no README do backend. O login retorna um Bearer JWT; clientes e administradores usam validade fixa de 30 dias, sem renovação automática. As rotas protegidas consultam a conta e seu estado. O frontend mantém o token no navegador e valida a sessão com a API; logout local não revoga uma cópia já emitida do token.

Clientes autenticados têm perfil, favoritos, carrinho e pedidos próprios. A API determina a identidade pelo token, não por um ID de usuário informado pelo cliente. A área administrativa exige perfil ADMIN e inclui manutenção de catálogo/categorias/configurações, upload de imagens quando Cloudinary está configurado e operações de pedidos.

O checkout revalida carrinho, estoque e dados da loja, cria o pedido e prepara uma mensagem/link do WhatsApp. A chamada de finalização aceita chave de idempotência para recuperar a mesma operação da conta. Novas finalizações estão limitadas a 20 por conta em 15 minutos; o contador é mantido em memória por processo. Consulte o README backend para as limitações operacionais e demais proteções HTTP.

## Comandos e testes

Na raiz:

```sh
npm test             # testes unitários do frontend
npm run typecheck    # TypeScript do frontend
npm run build        # build de produção do frontend
npx playwright install chromium
```

Os testes de navegador são executados por `npm run test:e2e`, que encaminha ao executor de banco isolado do backend. Ele exige PostgreSQL local, cria um banco temporário e o remove ao final. A configuração base aceita `mcd_store_demo` local; no CI, usa o banco de serviço local `mcd_store_ci`.

Os testes do backend, o banco temporário e as migrations usadas pelo helper também estão documentados em [backend/README.md](backend/README.md). Os comandos de build/typecheck não acessam banco; testes de integração e migrations, sim.

O workflow [`.github/workflows/ci.yml`](.github/workflows/ci.yml) executa essas verificações em push e pull request. O job de backend fornece PostgreSQL temporário ao runner e usa apenas valores fictícios; não há etapas de publicação.

### Validação local antes de publicar

Após instalar dependências com `npm ci` na raiz e em `backend/`, execute uma vez cada etapa pertinente:

```sh
# Frontend: typecheck, testes unitários e build
npm run typecheck
npm test
npm run build

# Backend: compilação (inclui TypeScript) e testes de integração isolados
cd backend
npm run build
npm test
```

Para validar também os fluxos de navegador, instale Chromium uma vez (`npx playwright install chromium`) e, a partir de `backend/`, execute `node tests/helpers/run-isolated.mjs browser`. Esse helper cria banco temporário local, aplica migrations e o remove ao final. Confira os requisitos e a proteção contra uso de bancos remotos em [backend/README.md](backend/README.md). Não use `npm run test:e2e` direto com um banco de produção.

## Estrutura principal

```text
src/                     frontend React, páginas, componentes e hooks
tests/                   testes unitários e de navegador do frontend
backend/src/routes/      montagem das rotas HTTP
backend/src/controllers/ adaptação HTTP e validação de entrada
backend/src/services/    regras de aplicação e acesso via Prisma
backend/src/middlewares/ autenticação, contexto e erros
backend/prisma/          schema e migrations
backend/tests/           testes de unidade e integração do backend
```

O fluxo geral do servidor é rotas e middlewares → controllers → services → Prisma/PostgreSQL. O frontend usa `/api` em desenvolvimento e `VITE_API_URL` quando precisa apontar diretamente para uma API.
