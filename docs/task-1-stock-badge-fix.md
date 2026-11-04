# Tarefa 1 — badges por variante

## Diagnóstico e reprodução

No commit `6a4301e`, `selectedStockBadge` passou a considerar qualquer `colorName` não vazio como uma dimensão de escolha obrigatória. Porém, a API exige cores nomeadas também nos produtos de cor única. No card, essa cor já aparece marcada, enquanto `badgeColorId` começa nulo. Assim, clicar em P (estoque 1) não criava o badge até clicar novamente na única cor.

Reprodução registrada com Playwright: o teste `single-color API products need only an explicit size` falhou antes da correção com `element(s) not found` ao procurar `ÚLTIMA PEÇA` após clicar em P. O teste de geometria anterior passou no mesmo código: ele clicava explicitamente na cor inicial depois do tamanho e, portanto, não exercitava o fluxo de escolha somente por tamanho. O teste unitário de dimensão única usava uma cor sem nome, estrutura que não corresponde à API de criação.

## Correção

- Uma cor única é fixa em produtos com tamanhos: exige-se a escolha explícita do tamanho.
- Várias cores continuam exigindo cor e tamanho explícitos.
- Produtos sem tamanho continuam exigindo a escolha da cor quando essa dimensão existe.
- IDs inválidos, combinações inexistentes ou ambíguas e estoque zero não produzem badge.
- O estoque continua sendo exclusivamente o da variante resolvida, com os mesmos toggles, limite e fallback amarelo.
- Nenhuma alteração em CSS, SVG, dimensões, cores ou componentes visuais.

## Cobertura

Fixtures com IDs de produto/cor/variante distintos, preço Decimal serializado e categoria aninhada. Cliques reais verificam P=1, M=5, troca, remoção, seleção parcial e troca para uma cor com estoque zero/acima do limite. Testes visuais existentes cobrem desktop/touch em 320, 390, 768 e 1440 px, 28% visível, expansão em 225 ms, teclado, slot manual e cores personalizadas. Teste do Manager salva os toggles e verifica seu efeito na loja, inclusive fallback quando o vermelho está desligado.

Antes do início da tarefa 2: 30 cenários Playwright distintos aprovados nas execuções relacionadas, 64 testes unitários do frontend, 3 testes de estoque do backend, typecheck, build e `git diff --check`. Na execução ampliada posterior, a fixture de estoque 1 foi isolada no teste novo para preservar as contagens originais dos demais testes do Manager; os cenários afetados foram reexecutados e aprovados.
