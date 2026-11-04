# Refinamento dos toasts e sombras dos badges

## Tarefa 1 — Botão Ver no Carrinho

Arquivos: `src/styles/toasts.css`, `tests/shopping.spec.ts`.

O botão usa largura ajustada ao texto, padding horizontal de 8 px por lado (antes 12 px) e fica centralizado na coluna útil da mensagem por margin-inline automático. Sua superfície visual tem 32 px de altura, mantendo uma área clicável de 44 px. O fundo e a borda são desenhados por um pseudo-elemento interno; a mensagem, o ícone, o botão de fechar e a barra não mudam de posição.

Normal: fundo discreto, borda e texto verdes #84d39d. Hover: fundo/borda #84d39d e texto escuro #121c16, com transição de 200 ms. Foco visível preservado; movimento reduzido remove a transição. O tamanho do toast não depende da redução visual do botão.

Validação da etapa: dois cenários aprovados, com medição de centralização, altura visual e área clicável, hover, abertura real do carrinho para visitante e USER, carrinho já aberto, mesma URL/documento e quantidade intacta.

## Tarefa 2 — Pausa real

Arquivos: `src/app/components/StoreToast.tsx`, `tests/shopping.spec.ts`.

O Sonner instalado possui pausa nativa por expanded/interacting/visibilidade. Nos toasts personalizados, o código já passa duration: Infinity, que desativa explicitamente seu temporizador interno. Não foi encontrado um segundo deadline nativo ativo. O progresso não tinha apenas uma animação CSS: o componente anterior já utilizava timeout de fechamento e interval de atualização.

A falha reproduzida foi na área externa: os handlers estavam no conteúdo .store-toast, deixando as bordas do card .store-toast-shell fora da detecção. O teste de hover na borda falhou antes da correção. A alegação de que o conteúdo pausava a barra mas não o deadline não se reproduziu nos testes do conteúdo; por isso não foi atribuída a um timer concorrente sem evidência.

Agora os eventos de ponteiro, toque e foco são observados no elemento completo do Sonner. A pausa cancela timeout e interval imediatamente e grava o saldo exato; a saída reprograma o timeout apenas com esse saldo. A mesma informação alimenta a barra. Atualizações de progresso não recriam o efeito nem reiniciam o prazo. Motivos simultâneos de pausa (hover, foco, toque e página oculta) são separados por um Set; o prazo só retoma quando todos forem liberados.

Cada toast tem seu próprio saldo, timers e motivos de pausa. O timeout nativo continua desativado somente nos toasts controlados por esse componente. A desmontagem remove timers e listeners. A duração continua 2500 ms. Botões de ação/fechar mantêm os callbacks existentes.

Validação da etapa: nove cenários distintos aprovados, incluindo borda, 10 segundos de hover, retomada dos aproximadamente 1500 ms restantes, hover na ação, outro toast expirando independentemente, fechamento manual durante pausa, quatro tipos, teclado, quatro larguras, movimento reduzido e carrinho real.

## Tarefa 3 — Sombra dos badges

Arquivos: `src/styles/store-theme.css`, `tests/badges.spec.ts`.

A sombra usa filter: drop-shadow(0 3px 5px rgb(0 0 0 / 0.45)) no SVG, seguindo o contorno e a ponta, sem box-shadow retangular ou sombra no texto. O SVG e o badge permitem que o efeito saia da caixa local para formar o halo.

A camada .store-product-badges passa a cobrir a altura da fotografia e aplica clip-path: inset(-1px 0 0 0). Esse único pixel superior corresponde à borda já coberta pelo automático, cujo posicionamento é preservado. O limite efetivo superior e esquerdo coincide com a borda externa existente do frame; o limite inferior coincide com o fim da foto. A sombra não ultrapassa essa moldura nem alcança descrição/cards vizinhos.

O clip local do automático permite 16 px para o halo nos outros lados; a camada externa continua impondo o limite da fotografia. O recolhimento mantém a translação de 85% e o recorte de 85% à esquerda, conservando 15% do badge. A transição permanece 225 ms.

Não houve alteração das posições dos badges ou dos caminhos SVG. Automáticos: 12 px de altura. Manuais: 112 × 34,947 px, sempre expandidos. Cores, textos, estoque e configurações permanecem intactos. O card e a fotografia conservam overflow visible; o link da imagem continua overflow hidden para o zoom. Somente a camada de badges recorta o efeito.

Validação da etapa: 24 cenários Playwright aprovados, com quatro larguras, desktop/toque, filtros, estoque por variantes, forma e altura, limites da camada, ausência de overflow, controles, movimento reduzido e fotos 4:5/zoom. Screenshots sobre fotos claras e escuras foram gerados; o estado expandido sobre foto clara foi inspecionado visualmente.

## Validação geral

- 67 testes unitários aprovados.
- Typecheck e build frontend aprovados.
- 49 cenários distintos de Playwright aprovados: 24 de badges/geometria, 21 da suíte completa de compras/notificações e quatro de estoque por seleção/configurações. Validada a interface em 320, 390, 768 e 1440 px.
- `git diff --check` aprovado.
- Backend, Prisma e banco do projeto não receberam alterações nesta solicitação. Integração de navegador executada em bancos temporários isolados.
- Alterações anteriores preservadas. Sem commit ou push.

Sem falhas finais ou pendências funcionais identificadas. A falha inicial do teste de hover na borda foi reproduzida antes da correção e passou depois. A suíte inteira de 256 cenários do projeto não foi repetida nesta solicitação; foram executados os testes relacionados às áreas alteradas e suas regressões.
