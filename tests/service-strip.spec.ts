import { test, expect } from "@playwright/test";

// Faixa "PROJETO END-TO-END" no celular (< 640px: 2 itens, "E-COMMERCE" escondido). Todos os espaços entre itens,
// inclusive a emenda entre as cópias do letreiro, iguais (±1px) ao longo de um ciclo completo do loop; e a cópia
// principal começa exatamente onde estava o layout original (sem salto).
for (const width of [320, 360, 390]) test(`marquee spacing stays equal through a full loop at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 800 });
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  const track = page.getByTestId("service-strip-track");
  // Antes de andar: o primeiro ícone da cópia principal no mesmo x do original.
  await expect.poll(() => page.evaluate(() => {
    const original = document.querySelector('[data-strip-part="icon1"]')!.getBoundingClientRect().left;
    const main = document.querySelector("[data-strip-main] svg")!.getBoundingClientRect().left;
    return Math.abs(main - original);
  })).toBeLessThanOrEqual(1);
  const copyWidth = await track.evaluate(el => parseFloat(getComputedStyle(el).getPropertyValue("--strip-copy")));
  const gaps = () => track.evaluate(el => {
    const box = (item: Element) => {
      const rects = [...item.querySelectorAll("svg, [data-strip-char], [data-strip-link] > span, [data-strip-tag]")]
        .filter(node => node.getClientRects().length && getComputedStyle(node).display !== "none").map(node => node.getBoundingClientRect());
      return [Math.min(...rects.map(r => r.left)), Math.max(...rects.map(r => r.right))];
    };
    // Por cópia: [ícone + PROJETO END-TO-END] e [por LUAN MACHADO + ícone].
    const items = [...el.children].flatMap(copy => { const [first, link, last] = [...copy.children].map(box); return [first, [link[0], last[1]]]; });
    return items.slice(1).map((item, index) => item[0] - items[index][1]);
  });
  // Amostra um ciclo completo (largura da cópia a 75px/s), depois que o letreiro começa a andar.
  await page.waitForTimeout(3000);
  const samples: number[][] = [];
  const cycleMs = (copyWidth / 75) * 1000;
  for (let elapsed = 0; elapsed <= cycleMs; elapsed += cycleMs / 8) {
    samples.push(await gaps());
    await page.waitForTimeout(cycleMs / 8);
  }
  for (const sample of samples) {
    expect(Math.max(...sample) - Math.min(...sample)).toBeLessThanOrEqual(1);
  }
});
