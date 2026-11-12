import { test, expect } from "@playwright/test";

for (const width of [320, 390, 768, 1440]) test(`product photos retain original 4:5 geometry across intrinsic ratios at ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 1000 });
  const ratios = [[200, 600], [400, 400], [900, 300]];
  const catalog = Array.from({ length: 6 }, (_, index) => ({
    id: 800 + index, name: `Geometry ${index}`, price: 30, public: "unissex", category: "camisetas", badge: index === 0 ? "ESPECIAL" : null,
    inCarousel: index < 2,
    colors: [{ id: 800 + index, colorName: "Preto", colorValue: "#111111", images: index % 2 ? [`/geometry-${index % 3}.svg`, `/geometry-${(index + 1) % 3}.svg`] : [`/geometry-${index % 3}.svg`], variants: [{ id: 800 + index, value: "P", stock: index === 0 ? 1 : 3 }] }]
  }));
  await page.route("**/geometry-*.svg", route => {
    const index = Number(route.request().url().match(/geometry-(\d)/)![1]);
    const [w, h] = ratios[index];
    return route.fulfill({ contentType: "image/svg+xml", body: `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="#d5d2c9"/><path d="M0 0L${w} ${h}M${w} 0L0 ${h}" stroke="#202326" stroke-width="20"/></svg>` });
  });
  await page.route("**/api/produtos{,/carrossel}", route => route.fulfill({ json: catalog }));
  await page.route("**/api/settings/public", route => route.fulfill({ json: { address: null, whatsapp: null, lowStockThreshold: 5, showLowStockBadge: true, showLastUnitBadge: true } }));
  await page.goto("/");
  const cards = page.locator(".store-product-card");
  await expect(cards).toHaveCount(6);
  await page.evaluate(() => document.fonts.ready); // medidas só com as fontes finais
  for (const card of await cards.all()) {
    const spacing = await card.evaluate(el => {
      const colors = el.querySelector('[aria-label="Selecionar cor"]')!, sizes = el.querySelector(".store-product-sizes")!;
      return { separation: sizes.getBoundingClientRect().top - colors.getBoundingClientRect().bottom, colorsGap: getComputedStyle(colors).gap, sizesGap: getComputedStyle(sizes).gap };
    });
    expect(spacing.separation).toBeCloseTo(16, 1);
    expect(spacing.colorsGap).toBe("8px");
    expect(spacing.sizesGap).toBe("4px");
  }
  await expect.poll(() => cards.locator("img").evaluateAll(images => images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
  const geometry = () => cards.evaluateAll(elements => elements.map(card => {
    const outer = card.getBoundingClientRect(), photo = card.firstElementChild!.getBoundingClientRect();
    const image = card.querySelector("img")!;
    return { cardTop: outer.top, cardHeight: outer.height, width: photo.width, height: photo.height, fit: getComputedStyle(image).objectFit };
  }));
  const initial = await geometry();
  console.log(`Photo measurements at ${width}px: ${JSON.stringify(initial)}`);
  for (const item of initial) {
    expect(item.width).toBeCloseTo(initial[0].width, 1);
    expect(item.height).toBeCloseTo(item.width * 5 / 4, 1);
    expect(item.height).toBeCloseTo(initial[0].height, 1);
    expect(item.fit).toBe("cover");
    for (const peer of initial.filter(peer => Math.abs(peer.cardTop - item.cardTop) < 1)) expect(peer.cardHeight).toBeCloseTo(item.cardHeight, 1);
  }
  await expect(cards.locator(".store-badge-automatic")).toHaveCount(0);
  await cards.first().getByRole("button", { name: "Preto", exact: true }).click();
  await cards.first().getByRole("button", { name: "P", exact: true }).click();
  await cards.nth(1).evaluate(el => window.scrollTo(0, window.scrollY + el.getBoundingClientRect().top - 120));
  await cards.nth(1).getByRole("img").hover();
  await cards.nth(1).getByRole("button", { name: "Próxima imagem", exact: true }).click();
  await expect(cards.nth(1).getByRole("img")).toHaveAttribute("src", "/geometry-2.svg");
  await cards.first().getByText("Geometry 0", { exact: true }).hover();
  await expect.poll(() => cards.first().getByRole("img").evaluate(image => parseFloat(getComputedStyle(image).scale) > 1)).toBe(true);
  const after = await geometry();
  for (let index = 0; index < initial.length; index++) {
    expect(after[index].width).toBeCloseTo(initial[index].width, 1);
    expect(after[index].height).toBeCloseTo(initial[index].height, 1);
    expect(after[index].cardHeight).toBeCloseTo(initial[index].cardHeight, 1);
  }
  const overlay = await cards.first().evaluate(card => {
    const outer = card.getBoundingClientRect(), photo = card.firstElementChild!;
    const path = card.querySelector<SVGPathElement>("[data-bookmark-shape]")!;
    const bounds = path.getBBox();
    const edge = new DOMPoint(bounds.x + bounds.width + 0.48, bounds.y - 0.48).matrixTransform(path.getScreenCTM()!);
    return { top: edge.y - outer.top, right: outer.right - edge.x, clipping: getComputedStyle(photo.querySelector("a")!).overflow, static: path.ownerSVGElement!.getAnimations().length === 0 };
  });
  expect(overlay.top).toBeCloseTo(0, 1); expect(overlay.right).toBeCloseTo(8, 1);
  expect(overlay.clipping).toBe("hidden"); expect(overlay.static).toBe(true);
  // Selo manual sobre a foto; aviso de estoque na linha do preço (fora da foto), sem mudar a altura do card.
  await expect(cards.first().locator('[aria-label="Badges do produto"] .store-badge-manual')).toHaveCount(1);
  await expect(cards.first().locator(".store-product-price .store-badge-automatic")).toHaveText('ÚLTIMA PEÇA "P"');
  await expect(cards.first().locator(".store-product-photo .store-badge-automatic")).toHaveCount(0);
  const effects = await cards.first().evaluate(card => {
    const photo = card.querySelector(".store-product-photo")!, layer = card.querySelector(".store-favorite-layer")!;
    return {
      filters: [...card.querySelectorAll(".store-product-badges svg, .store-favorite-bookmark svg")].map(svg => getComputedStyle(svg).filter),
      clipping: getComputedStyle(layer).clipPath,
      frameMatches: layer.getBoundingClientRect().width === photo.getBoundingClientRect().width && layer.getBoundingClientRect().height === photo.getBoundingClientRect().height,
      hitArea: card.querySelector(".store-favorite-bookmark")!.getBoundingClientRect().width,
      photoOverflow: getComputedStyle(photo).overflow,
    };
  });
  expect(new Set(effects.filters).size).toBe(1);
  expect(effects.filters[0]).toContain("drop-shadow");
  expect(effects.clipping).toBe("inset(-1px 0px 0px)");
  expect(effects.frameMatches).toBe(true);
  expect(effects.hitArea).toBe(44);
  expect(effects.photoOverflow).toBe("visible");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath(`uniform-cards-${width}.png`), fullPage: true });
});

// Catálogo com nome longo, muitos tamanhos e várias cores lado a lado com um produto "curto".
const mixed = [
  { name: "Curto", sizes: ["P"], colors: 1 },
  { name: "Camiseta Essential Básica de Algodão Orgânico Com Nome Bem Comprido", sizes: ["36", "37", "38", "39", "40"], colors: 3 },
  { name: "Médio", sizes: ["P", "M", "G", "GG", "XG"], colors: 2 },
  { name: "Outro", sizes: ["4", "6"], colors: 1 },
].map((item, index) => ({
  id: 860 + index, name: item.name, price: 30, public: "unissex", category: "camisetas", badge: null,
  colors: Array.from({ length: item.colors }, (_, color) => ({
    id: 860 + index * 10 + color, colorName: `Cor ${color}`, colorValue: ["#111111", "#d9b44a", "#3d6fa5"][color], images: ["/mixed.svg"],
    variants: item.sizes.map((value, size) => ({ id: 8600 + index * 100 + color * 10 + size, value, stock: 3 })),
  })),
}));
async function mixedCatalog(page: import("@playwright/test").Page) {
  await page.route("**/mixed.svg", route => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500"><rect width="100%" height="100%" fill="#d5d2c9"/></svg>' }));
  await page.route("**/api/produtos{,/carrossel}", route => route.fulfill({ json: mixed }));
  await page.route("**/api/settings/public", route => route.fulfill({ json: { address: null, whatsapp: null, lowStockThreshold: 1, showLowStockBadge: false, showLastUnitBadge: false } }));
}

// Produto abre na mesma aba (sem target="_blank"); Ctrl+clique continua abrindo outra aba; voltar retorna à lista.
test("product links open in the same tab and back returns to the list position", async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await mixedCatalog(page);
  await page.goto("/");
  const link = page.locator(".store-product-card").filter({ hasText: "Outro" }).locator("a").first();
  await expect(link).not.toHaveAttribute("target", /./);
  await expect(link).not.toHaveAttribute("rel", /./);
  await link.scrollIntoViewIfNeeded();
  const listY = await page.evaluate(() => scrollY);
  expect(listY).toBeGreaterThan(0);
  const pages = context.pages().length;
  await link.click();
  await expect(page).toHaveURL(/productId=863/);
  await expect(page.locator(".store-product-detail")).toBeVisible();
  expect(context.pages()).toHaveLength(pages);
  await page.goBack();
  await expect(page.locator(".store-product-card")).toHaveCount(mixed.length);
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(listY);
  const [opened] = await Promise.all([context.waitForEvent("page"), link.click({ modifiers: ["Control"] })]);
  await expect(opened).toHaveURL(/productId=863/);
  await expect(page).not.toHaveURL(/productId=/);
});
