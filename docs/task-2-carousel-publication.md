# Tarefa 2 — produtos não publicados no carrossel

## Arquitetura e regra

O modelo Prisma já possui `isPublished` (checkbox “Publicado na loja”) e `inCarousel` (seleção explícita do Manager). A seleção já aceita produtos não publicados e limita o carrossel a cinco itens por transação. Antes, a loja montava seus slides filtrando a lista de `/produtos`, que contém somente publicados; por isso a seleção dos rascunhos não chegava ao carrossel.

Foi criado `GET /produtos/carrossel`: retorna somente produtos com `inCarousel=true`, publicados ou não, em ordem de ID e no máximo cinco, com `Cache-Control: no-store`. `/produtos` continua exigindo `isPublished=true`. Nenhuma mudança de schema ou migration é necessária.

No frontend, os slides possuem uma consulta e estado próprios, separados do catálogo. Ambos atualizam após alterações do Manager, foco/visibilidade e atualização periódica. Os dados do carrossel não são fornecidos aos filtros, ordenação, contagem, página de detalhes nem carrinho. A seleção, imagens, navegação, autoplay e animações existentes permanecem. Somente slides publicados têm `VER MAIS`.

## Disponibilidade para compra

- Links diretos de produto são resolvidos exclusivamente no catálogo publicado.
- Favoritos de USER e ADMIN retornam somente produtos publicados. Vínculos antigos são preservados e voltam a aparecer se o produto for republicado. Novos favoritos de produtos não publicados são recusados.
- A página de Favoritos filtra também o snapshot local pela publicação e presença no catálogo atual, evitando cards compráveis desatualizados.
- Inclusões e alterações de quantidade por API recusam produtos não publicados. Importação de carrinho de visitante ignora esses itens e informa sua indisponibilidade.
- O carrinho comum reconcilia itens que deixaram de ser publicados; a conferência de checkout mantém os itens indisponíveis para informar conflitos e continua bloqueando a finalização.
- Carrinhos de visitante/ADMIN são reconstruídos com o catálogo publicado, e a inclusão local exige presença nele.
- Categorias públicas já exigem produtos publicados com estoque positivo. Tamanhos também ignoram produtos não publicados defensivamente.

Os filtros existentes da loja são categorias, público e tamanhos, além de ordenação por nome/preço. Não há atualmente controles públicos de pesquisa textual, cor ou faixa de preço; a separação mantém rascunhos fora da fonte de dados do catálogo sem criar funcionalidades novas.

## Validação

Testes com fixtures de API (IDs separados, Decimal serializado, categoria aninhada) verificam rascunho selecionado, rascunho não selecionado, ausência de CTA/links, catálogo, contagem, tamanhos/categorias, link direto e carrinho local antigo, em desktop e mobile. O fluxo real do Manager verifica seleção explícita e publicação/despublicação sem perder o slide. Testes de favoritos cobrem USER e ADMIN, inclusive snapshots antigos.

Integrações HTTP/PostgreSQL verificam o endpoint separado, seleção, limite de cinco, categorias públicas, favoritos, inclusão/importação de carrinho, republicação e conferência de checkout. As suites abrangentes usam bancos temporários pelo runner existente `backend/tests/helpers/run-isolated.mjs`, sem resetar o banco do projeto nem modificar sua seleção de slides.

O anexo recebido termina em “Produto B pode”. A implementação segue os requisitos completos presentes antes desse trecho.

## Resultado final das verificações

- `npm test`: 66 testes aprovados.
- Backend: 27 testes de integração relacionados aprovados via runner isolado; 3 testes unitários de estoque aprovados na tarefa 1.
- Playwright: 114 cenários distintos validados. A execução ampliada aprovou 104 de 112; quatro fixtures antigas de carrossel precisavam interceptar o novo endpoint, uma medição precisava aguardar a fonte, e três testes de contagem receberam indevidamente a fixture nova de estoque 1. Após corrigir esses pontos, a reexecução focada aprovou 13/13, incluindo os oito casos anteriores e dois novos cenários de favoritos.
- `npm run typecheck`, builds do frontend/backend e `git diff --check`: aprovados.
- Sem alterações em CSS, SVG dos badges ou schema Prisma; sem commit, push ou reset do banco do projeto.
