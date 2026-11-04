# Badges 1,5x na imagem principal do produto

## Dimensões

| Propriedade | Catálogo / VEJA TAMBÉM / anterior no detalhe | Novo na imagem principal |
| --- | --- | --- |
| Automático vermelho — largura solicitada | 100,8 px | 151,2 px |
| Automático amarelo — largura solicitada | 114 px | 171 px |
| Automáticos — altura | 12 px | 18 px |
| Automáticos — fonte | 9 px | 13,5 px |
| Manual — largura | 89,6 px | 134,4 px |
| Manual — altura | 27,9576 px | 41,9364 px |
| Manual — fonte | 7 px | 10,5 px |

As larguras solicitadas dos automáticos continuam sujeitas ao limite responsivo do contêiner. O amarelo do catálogo pode ocupar 108 px em 320 px, conforme a implementação anterior. Nas quatro larguras verificadas, a imagem principal acomoda integralmente 151,2 e 171 px.

## Isolamento e preservação

ProductBadges aceita size="default" ou size="detail", com default como padrão, e repassa a variante a ProductBadge. Somente a chamada sobre a imagem principal de ProductDetailPage recebe size="detail". Os cards do catálogo, favoritos, recomendações e previews do Manager continuam usando o padrão.

ProductBadge calcula dimensões externas com fator 1,5. O viewBox e os caminhos SVG originais permanecem, portanto corpo e ponta aumentam proporcionalmente nas duas direções. As fontes da variante são explícitas e os insets percentuais aumentam junto com a largura/altura. Não há transform: scale(1.5), nem mudança nas dimensões da foto.

Peso, família, line-height proporcional, cores, limite de 12 caracteres, alinhamento inferior do manual e superior do automático foram preservados. O recorte e a sombra SVG compartilhada continuam iguais. Os automáticos mantêm 15% visíveis, expansão no hover, 225 ms e comportamento touch; manuais permanecem expandidos. A lógica de estoque, seleção e toggles não recebeu alterações.

## Arquivos modificados nesta solicitação

- src/app/components/ProductBadge.tsx — variante e dimensões proporcionais.
- src/app/components/ProductBadges.tsx — encaminhamento da variante.
- src/app/App.tsx — size="detail" somente na imagem principal.
- src/styles/store-theme.css — altura, fontes e limite de largura restritos à variante.
- tests/product-detail-badges.spec.ts — dimensões novas e isolamento, desktop/touch em quatro larguras.
- docs/detail-badge-scale.md — este relatório.

## Validação

- 69 unitários frontend aprovados.
- Typecheck e build frontend aprovados.
- 39 cenários Playwright aprovados: 18 de badges do catálogo, 13 de detalhe (incluindo oito combinações desktop/touch × quatro larguras) e oito de VEJA TAMBÉM.
- git diff --check aprovado, sem erros de whitespace.
- Cobertura: 320, 390, 768 e 1440 px; fontes e geometrias 1,5x, catálogo e recomendações no padrão, 12 caracteres largos, mesma sombra/path, clipping, foto sem mudança de tamanho, variante e toggles, hover com 15%/225 ms, touch e galeria.
- Limite: suíte de navegador relacionada, não toda a suíte do projeto. Nenhuma alteração de backend ou banco do projeto; testes usam banco temporário isolado.
- Alterações anteriores preservadas. Sem commit ou push.
