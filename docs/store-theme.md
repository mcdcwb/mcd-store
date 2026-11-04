# Identidade visual da loja pública

## Auditoria

Frontend React com Tailwind 4, mapeamento `@theme inline` em theme.css e tokens
CSS consumidos pelos componentes. Há dois blocos :root existentes: o segundo
define a paleta azul clara efetiva; o primeiro ainda fornece input-background.
Ambos foram preservados para manter exatamente a aparência administrativa.
fonts.css, tipografia, breakpoints e dimensões não foram alterados.

App.tsx contém Header, slider, catálogo, cards, tamanhos, cores, detalhe do produto,
carrinho, login/cadastro e Footer. AccountMenu, CatalogFilters, AccountPage e
CheckoutPage já usam os tokens compartilhados. O Aside real possui tamanhos,
público e categorias; esta etapa não adiciona filtros nem muda sua lógica.
O slider mantém imagens object-contain sobre a própria imagem ampliada/desfocada,
altura 288/420px, autoplay e controles. Imagens e placeholders são preservados.

Foram encontrados inputs de autenticação com texto preto fixo, controles de imagem
brancos/neutros, favorito sem superfície de contraste, faixa de entrega azul e
toasts claros. Estes receberam tratamento visual público, mantendo as dimensões.
Os componentes do Manager e do backend não foram editados.

## Escopo e tokens

`src/styles/store-theme.css`, importado depois do tema/toasts, define os tokens
em `html[data-store-theme="dark"]`. StoreTheme em main.tsx aplica/remove esse
atributo conforme a rota usando useLayoutEffect antes da pintura. `/manager` e
subrotas usam exclusivamente o tema original, inclusive seus modais e Sonner.
O escopo no html cobre os overlays e notificações renderizados fora do conteúdo
principal. Não há tema persistido, alternador ou biblioteca nova.

| Token | HEX | Uso |
| --- | --- | --- |
| background | #0D0F10 | Fundo principal |
| card | #181B1D | Cards, drawer e modais |
| popover / muted | #23272A | Superfícies elevadas e hover |
| secondary | #15181A | Footer e faixa de entrega |
| foreground | #F3F4EF | Texto principal |
| muted-foreground | #B7BEC3 | Texto secundário e placeholders |
| border | #3E454B | Divisores e bordas discretas |
| control-border / input | #68727A | Inputs e controles |
| input-background | #141719 | Campos |
| primary / ring | #F4EC03 | Destaque da marca e foco |
| primary-hover | #C6E300 | Hover do CTA |
| primary-foreground | #121500 | Texto sobre amarelo-limão |
| accent | #2B3033 | Destaque neutro secundário |
| destructive | #FF929A | Erros e remoção |
| destructive-foreground | #30080E | Texto sobre botão destrutivo |
| success | #9FE0B4 | Confirmações positivas |
| success-background / border | #12281C / #366749 | Toast de sucesso |
| warning / background / border | #F2D68B / #302810 / #6E5B2B | Avisos e alterações |
| danger-foreground / background / border | #FFB2B7 / #321C20 / #78454D | Toast de erro/remoção |
| image-control / foreground / border | #141719 / #F3F4EF / #8B949B | Controles sobre fotos |
| whatsapp / foreground | #25D366 / #082713 | Marca reconhecível com texto contrastante |

Tokens Tailwind adicionais em theme.css têm fallback idêntico ao visual anterior
para os inputs compartilhados com o Manager. As demais mudanças no App são classes
de apresentação. Nenhum handler comercial, autenticação ou API foi alterado.

## Decisões visuais e acessibilidade

Amarelo em CTAs, preços, pequenos badges, indicadores ativos, seleções e foco.
A faixa de entrega fica grafite; não foi transformada em grande bloco amarelo.
Sucesso permanece verde; erro vermelho; aviso âmbar; WhatsApp verde.
Cards diferem do fundo por superfície/borda e não ganham sombra no hover.
Tamanhos continuam exatamente 48×48px. Cores mantêm o swatch real e ring fino,
com offset contrastante tanto em branco quanto em preto. A seleção dos botões
também usa sublinhado; favoritos mantêm coração preenchido e aria-pressed.

Foco visível de 2px com offset de 3px cobre botões, links e campos públicos.
Disabled mantém bloqueio original e usa opacidade 0.65. Inputs e placeholders
legíveis; controles sobre imagens têm fundo escuro próprio.

Contrastes calculados em sRGB: texto/card 15.66:1, secundário/card 9.20:1,
CTA 16.28:1, input 16.29:1, borda de controle/input 3.67:1, sucesso 10.25:1,
erro 9.30:1, aviso 10.28:1 e WhatsApp 8.08:1.

## Revisão

Testes públicos existentes continuam verificando filtros, slider, tamanhos,
cores, carrinho, favoritos, autenticação, conta, checkout e horários do Footer.
Cenários adicionais em filters.spec.ts verificam 320/390/768/1440px, tokens
computados, contraste de input, selected, dimensões, overflow, drawer,
login/cadastro, toasts e retorno ao tema original ao entrar no Manager.
Screenshots de catálogo, carrinho e cadastro são salvos nos artefatos Playwright.

Validação final: 61 testes frontend e 86 cenários Playwright relevantes passaram.
Typecheck, build frontend e git diff --check passaram. As expectativas antigas de
toast foram atualizadas por rota, preservando as verificações de quantidade,
mensagem, semântica e comportamento. O teste visual diferencia explicitamente
hover e seleção. Não há suíte de snapshots de referência; os screenshots
existentes e novos foram gerados e revisados. Catálogo desktop/mobile, drawer e
cadastro em 320px foram inspecionados visualmente.

Para revisão humana, observar especialmente o equilíbrio do amarelo em logo,
preços e CTAs, as fotos reais contra superfícies escuras e os controles sobre elas.
Não houve reconstrução de layout, troca de tipografia, mudança de conteúdo,
redesign do Manager, alteração de backend/API/banco ou nova migration.
