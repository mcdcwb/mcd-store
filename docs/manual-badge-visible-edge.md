# Alinhamento da borda visível dos badges manuais

## Investigação e causa

A medição no Chromium comparou getBBox() do path, viewBox, getScreenCTM(), caixa CSS do badge, fotografia e camada de recorte. O desenho ocupa exatamente o viewBox 0 0 112 34.947, sem margem transparente inferior. A caixa do SVG tem a mesma altura da caixa CSS. Não há transformação no manual, padding na fotografia ou gap entre fotografia e informações nos cards.

Foram encontradas duas situações diferentes:

- Catálogo e VEJA TAMBÉM: bottom: -1px colocava a borda desenhada 1 px abaixo da fotografia, e o clipping cortava esse pixel. Em 320 px, fotografia terminava em y=521,5 e o desenho em y=522,5. Não foi reproduzida uma faixa retangular de imagem abaixo do corpo; o problema confirmado era o corte do desenho.
- Detalhe: a fotografia tem borda própria de 1 px. A camada absoluta com height: 100% terminava no limite interno, antes da borda inferior. O desenho deslocado por bottom: -1px chegava à borda externa, mas era cortado antes dela, deixando a linha inferior do contêiner abaixo da área visível do badge. Desenho/foto terminavam em y=666, mas o clipping terminava em y=665.

Não houve alteração do SVG para compensar um espaço transparente inexistente. A região vazia abaixo da ponta inclinada é inerente ao formato original; ela foi preservada, conforme solicitado.

## Correção

O manual voltou a bottom: 0, eliminando o deslocamento que cortava seu corpo. No detalhe, somente a camada de badges recebe height: calc(100% + 1px), incluindo a borda inferior existente na referência de posicionamento e recorte. O topo e a posição dos automáticos permanecem iguais.

Assim, a borda real do path, convertida para coordenadas da página, termina no mesmo ponto que o contêiner visível da fotografia e a camada de clipping. O desenho fica inteiro; somente a sombra que sairia pela borda inferior é recortada. Não foram alteradas proporção/tamanho da imagem, altura do card, espaçamentos das informações, miniaturas ou layout.

Dimensões preservadas: 89,6 × 27,9576 px nos cards e 134,4 × 41,9364 px na imagem principal, com size="detail" e fator 1,5 intactos. Cores, fontes, caminhos SVG, sombra, limite de 12 caracteres e lógica de estoque não mudaram.

## Arquivos desta solicitação

- src/styles/store-theme.css — alinhamento sem deslocamento negativo e recorte do detalhe incluindo a borda inferior.
- tests/manual-alignment-badges.spec.ts — geometria visível, limites do clipping, corpo inteiro, medidas, catálogo/detalhe/recomendações, zoom e galeria nas quatro larguras.
- tests/badges.spec.ts — expectativa de alinhamento inferior sem corte.
- tests/product-corrections.spec.ts — limite inferior com tolerância subpixel de 0,05 px, sem permitir o deslocamento anterior de 1 px.
- docs/manual-badge-visible-edge.md — este relatório.

## Validação

- 69 unitários frontend aprovados.
- Typecheck e build frontend aprovados.
- 52 cenários Playwright aprovados: quatro novos de geometria visível, 18 de badges do catálogo, quatro de proporção/zoom/controles, cinco de variantes e favoritos, 13 de detalhe/escala/desktop/touch e oito de recomendações.
- git diff --check aprovado, sem erros de whitespace.
- Screenshots em 320 px inspecionados: corpo do badge rente à divisão inferior, ponta original preservada e desenho inteiro nas duas variantes.
- Limites: testes em Chromium nas larguras 320, 390, 768 e 1440 px; não foi executada toda a suíte do projeto. Coordenadas geométricas usam tolerância subpixel, sem compensações visuais adicionais.
- Alterações anteriores preservadas. Sem commit, push, alteração de backend ou reset do banco do projeto. Os testes usam banco temporário isolado.

## Continuação da investigação raster

O log `$env:TEMP\lowen-raster-before.log` registrava `strip: []`, mas a amostra era uma única coluna em x=20, dentro do preenchimento azul do badge (RGB 36,87,167). A imagem sintética rosa era verificada apenas por pixels com R > B + 15, logo a coluna não podia revelar a faixa ao lado da ponta. O log não cobria o detalhe nem variava a sua largura/zoom.

O teste raster foi preservado e ampliado para varrer a borda inferior da fotografia no catálogo em 7 larguras (320, 390, 768, 1280, 1440, 1649, 1920), 3 zooms (90%, 100%, 110%) e 4 DPRs (1, 1,25, 1,5, 2). A amostragem percorre o corpo do badge e a ponta separadamente. Pixels rosa aparecem somente junto à ponta inclinada e aumentam com a densidade de pixels; o trecho reto do corpo permanece azul até a divisão inferior. As screenshots e medidas do detalhe foram verificadas nas larguras 320, 390, 768 e 1440 com os mesmos três zooms: o corpo reto não revela pixels rosa, e a diferença de borda fica limitada a 0,11 CSS px por arredondamento subpixel.

**Causa confirmada:** a linha rosa descrita como uma faixa sob o badge coincide com a área intencionalmente não pintada pela ponta inclinada do SVG. No detalhe, o frame inclui uma borda inferior de 1 px; a camada de badges era 1 px mais curta e o deslocamento negativo anterior cortava o desenho. A regra existente `height: calc(100% + 1px)` no detalhe e `bottom: 0` corrige esse recorte. Não há margem transparente excedente no path; alterar o posicionamento para cobrir a ponta cortaria/distorceria o SVG ou estenderia o badge para fora do frame. O espaço sob a ponta é parte do formato original, não uma falha do layout.

**Validação nesta continuação:** `tests/manual-alignment-badges.spec.ts` e `tests/product-detail-badges.spec.ts` passaram juntos: 21 testes aprovados. `git diff --check` passou nos arquivos envolvidos. Nenhuma regra visual ou tamanho de layout foi alterado nesta continuação; o teste raster recebeu a amostragem adicional. Sem commit ou push.
## Reavaliação solicitada em 2026-10-13

A conclusão da seção anterior não pode ser tratada como comprovada: os screenshots de teste usam fixtures sintéticas, e o teste raster anterior não comparava a mesma coordenada com o badge visível e oculto. Nesta reavaliação, foi acrescentada captura de controle com o badge oculto e leitura RGB de pixels pareados. No catálogo, pixels do corpo visível são azuis (36,87,167); alguns controles revelam a fotografia da fixture (233,204,204), mas em DPR fracionário as coordenadas e antialias/sombra misturam os pixels (por exemplo, RGB próximo de 55,54,56). A classificação consistente dos pares falha; portanto, o teste deixa as capturas/RGB para diagnóstico e não declara a correção concluída.

No detalhe, a imagem está em `object-contain` dentro de uma caixa mais alta; a área inferior da caixa é fundo de imagem, não necessariamente fotografia. A captura sem badge nessa região mostrou graphite (35,39,42), não a fixture rosa. A ponta inclinada foi preservada pelo mesmo SVG e viewBox. A seção VEJA TAMBÉM usa o mesmo componente de card e tem screenshot dedicado.

Nenhuma nova mudança de posicionamento foi mantida nesta reavaliação. A tentativa de `translateY(1px)` foi revertida porque deslocava o path para fora do frame e falhava os limites de clipping. A regra anterior específica do detalhe (`height: calc(100% + 1px)`) foi preservada. Não é possível confirmar a faixa descrita em uma fotografia original ausente; para resolver a ambiguidade dos pixels em DPR fracionário é necessária a captura original ou uma amostra fotográfica real que permita validar o mapeamento e a silhueta.

Validação da versão final: Playwright combinado 21/21 passou; o raster de catálogo cobre 7 larguras × 3 zooms × 4 DPRs com screenshots pareadas (badge visível/oculto). RGB do corpo é azul e o controle no mesmo ponto mostra a fixture rosa em amostras estáveis; bordas com sombra/antialias ficam registradas sem assert de limiar. `npm run typecheck`, `npm run build` e `git diff --check` passaram. A causa específica relatada pelo usuário não pode ser confirmada com a captura original indisponível, então não declaro a correção concluída. Sem commit/push.