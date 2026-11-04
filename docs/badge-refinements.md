# Padronização e refinamento dos badges

## Resultado

- Badges manuais: tamanho fixo de 112 × 34,947 px, altura baseada no antigo NOVIDADE. A ponta original foi preservada, ampliando apenas o corpo reto. Texto centralizado no corpo, com cores do Manager e espaço para até 12 caracteres.
- Manager: limite de 12 caracteres na criação e na alteração, contador ao vivo, preview e remoção. Textos antigos maiores continuam intactos enquanto não forem alterados; salvar outros campos não os modifica.
- Backend: criação validada pelo schema; alteração validada dentro da transação, após ler o produto existente. Uma atualização com o mesmo texto antigo é aceita; um novo texto maior que 12 é rejeitado antes de qualquer alteração.
- Automáticos: ponta mais curta e arredondada com geometria SVG nativa, mantendo cores, fonte e meia altura. Recolhimento deixa 15% visível; expansão mantém 225 ms, hover do card, teclado, toque e movimento reduzido.
- A faixa superior era o pixel de borda do card acima da área interna da foto. Somente o slot automático foi ajustado em 1 px para cobrir essa borda. O manual e a proporção da foto permanecem no lugar.
- Preservadas as regras de estoque, seleção explícita de tamanho para cor única, variantes de múltiplas cores, configurações e fallback. Preservadas também as correções anteriores do carrossel.

## Validação

- 29 testes Playwright aprovados, incluindo larguras 320, 390, 768 e 1440 px, desktop e toque, geometria, texto de 12 caracteres, Manager, estoque, configurações e carrossel.
- 67 testes unitários de frontend aprovados.
- 13 testes de backend aprovados, incluindo validação de badges, preservação de legado e rejeição atômica.
- Typecheck e builds de frontend/backend aprovados; diff sem erros de whitespace.
- Screenshots de badges expandidos/recolhidos e tamanhos manuais gerados em test-results; inspeção visual do estado expandido realizada.

Sem migrações, commits ou push. Os testes de integração usaram bancos temporários isolados. O pedido recebido termina no item do contador de caracteres e não trouxe imagens de referência acessíveis; o refinamento usa o SVG existente como referência.
