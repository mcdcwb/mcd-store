import { test, expect, type Page } from "@playwright/test";

// Detalhe do produto: aviso automático de estoque ao lado do preço (como no card); selo manual sobre a foto, em tamanho "detail" (1,5×).
const fixture = (multicolor = false) => ({ id: 9800, name: "Produto detalhe badges", price: 30, public: "unissex", category: "camisetas", isPublished: true,
  badge: "LANÇAMENTO", badgeBackgroundColor: "#2457A7", badgeTextColor: "#FFFFFF",
  colors: [{ id: 9801, colorName: "Preto", colorValue: "#111111", images: ["/detail-light.svg", "/detail-dark.svg"],
    variants: [{ id: 1, value: "P", stock: 1 }, { id: 2, value: "M", stock: 3 }, { id: 3, value: "G", stock: 8 }, { id: 4, value: "GG", stock: 0 }] },
    ...(multicolor ? [{ id: 9802, colorName: "Branco", colorValue: "#FFFFFF", images: ["/detail-dark.svg"], variants: [{ id: 5, value: "P", stock: 3 }, { id: 6, value: "M", stock: 0 }] }] : [])] });

async function setup(page: Page, multicolor = false, related = false) {
  const settings = { address: null, whatsapp: null, lowStockThreshold: 5, showLowStockBadge: true, showLastUnitBadge: true };
  const product = fixture(multicolor);
  if (related) product.badge = "WWWWWWWWWWWW";
  const products = [product, ...(related ? [1, 3].map((stock, index) => ({ ...product, id: 9803 + index, name: `Comparação ${index}`, badge: "NOVIDADE",
    colors: [{ ...product.colors[0], id: 9810 + index, variants: [{ id: 9810 + index, value: "P", stock }] }] })) : [])];
  await page.route("**/api/produtos", route => route.fulfill({ json: products }));
  await page.route("**/api/settings/public", route => route.fulfill({ json: settings }));
  await page.route("**/detail-*.svg", route => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500"><rect width="400" height="500" fill="#ddd"/></svg>' }));
  await page.goto("/?productId=9800");
  await expect(page.getByRole("heading", { name: product.name })).toBeVisible();
  return settings;
}

for (const width of [320, 390, 768, 1440]) test(`detail badges respect size stock, toggles and photo frame at ${width}`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 1000 });
  const settings = await setup(page);
  const content = page.locator(".store-product-detail-content"), photo = page.locator(".store-detail-photo"), manual = photo.locator(".store-badge-manual");
  const auto = content.locator(".store-product-price .store-badge-automatic");
  await expect(manual).toBeVisible();
  const favorite = photo.locator(".store-favorite-bookmark"), tooltip = photo.locator(".store-favorite-tooltip");
  await favorite.hover(); await expect(tooltip).toHaveText("Adicionar aos Favoritos"); await expect(tooltip).toBeVisible();
  expect(await tooltip.evaluate(el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; })).toBe(true);
  await favorite.focus(); await page.keyboard.press("Tab"); await page.keyboard.press("Shift+Tab");
  await expect(favorite).toBeFocused(); await expect(tooltip).toBeVisible();
  await expect(manual.locator("path")).toHaveAttribute("fill", "#2457A7");
  await expect(photo.locator(".store-badge-automatic")).toHaveCount(0); // o aviso nunca vai para a foto
  await expect(auto).toHaveCount(0);
  await content.getByRole("button", { name: "P", exact: true }).click();
  await expect(auto).toHaveText('ÚLTIMA PEÇA "P"');
  await expect(auto).toHaveCSS("background-color", "rgb(180, 35, 50)");
  await expect(auto).toHaveCSS("font-size", "11px");
  settings.showLastUnitBadge = false;
  await page.evaluate(() => window.dispatchEvent(new Event("store-details-updated")));
  await expect(auto).toHaveText('POUCAS UNIDADES "P"');
  settings.showLowStockBadge = false;
  await page.evaluate(() => window.dispatchEvent(new Event("store-details-updated")));
  await expect(auto).toHaveCount(0);
  settings.showLastUnitBadge = settings.showLowStockBadge = true;
  await page.evaluate(() => window.dispatchEvent(new Event("store-details-updated")));
  await expect(auto).toHaveText('ÚLTIMA PEÇA "P"');
  await content.getByRole("button", { name: "M", exact: true }).click();
  await expect(auto).toHaveText('POUCAS UNIDADES "M"');
  await content.getByRole("button", { name: "G", exact: true }).click();
  await expect(auto).toHaveCount(0);
  await expect(content.getByRole("button", { name: "GG", exact: true })).toBeDisabled();
  await content.getByRole("button", { name: "Ver imagem 2", exact: true }).click();
  await expect(photo.getByRole("img")).toHaveAttribute("src", "/detail-dark.svg");
  const geometry = await manual.evaluate(el => {
    const bounds = el.getBoundingClientRect(), photo = el.closest(".store-product-photo")!.getBoundingClientRect(), label = el.querySelector(".product-tag-label")!.getBoundingClientRect();
    return { width: bounds.width, height: bounds.height, bottom: bounds.bottom - photo.bottom, textInside: label.bottom <= photo.bottom,
      clip: getComputedStyle(el.parentElement!).clipPath, shadow: getComputedStyle(el.querySelector("svg")!).filter };
  });
  expect(geometry.width).toBeCloseTo(134.4, 1); expect(geometry.height).toBeCloseTo(41.9364, 1);
  expect(geometry.bottom).toBeGreaterThan(0); expect(geometry.bottom).toBeLessThan(geometry.height * 0.15); // The top-right SVG tip remains fully visible.
  expect(geometry.clip).toBe("inset(-1px 0px -2%)"); expect(geometry.shadow).toContain("drop-shadow");
  await photo.screenshot({ path: info.outputPath(`detail-badges-${width}.png`) });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

for (const touch of [false, true]) for (const width of [320, 390, 768, 1440]) test.describe(`detail scale ${touch ? "touch" : "desktop"} ${width}`, () => {
  test.use({ viewport: { width, height: 1000 }, hasTouch: touch, isMobile: touch });
  test("detail manual badge is 1.5x the catalog one and the stock notice keeps the detail layout", async ({ page }, info) => {
    await setup(page, false, true);
    const content = page.locator(".store-product-detail-content"), photo = page.locator(".store-detail-photo");
    const auto = content.locator(".store-product-price .store-badge-automatic"), manual = photo.locator(".store-badge-manual");
    const originalPhoto = await photo.boundingBox();
    const recommended = page.getByRole("region", { name: "VEJA TAMBÉM" }).locator(".store-product-card");
    for (const card of await recommended.all()) await card.getByRole("button", { name: "P", exact: true }).click();
    // Avisos dos cards relacionados: mesmo texto e tipografia do catálogo.
    await expect(recommended.locator(".store-badge-automatic")).toHaveText(['ÚLTIMA PEÇA "P"', 'POUCAS UNIDADES "P"']);
    for (const badge of await recommended.locator(".store-badge-automatic").all()) await expect(badge).toHaveCSS("font-size", "11px");
    const defaultManual = (await recommended.first().locator(".store-badge-manual").boundingBox())!;
    expect(defaultManual.width).toBeCloseTo(89.6, 1); expect(defaultManual.height).toBeCloseTo(27.9576, 1);
    const priceRow = () => content.locator(".store-product-price").evaluate(el => el.getBoundingClientRect().height);
    const rowBefore = await priceRow();
    await content.getByRole("button", { name: "P", exact: true }).click();
    await expect(auto).toHaveText('ÚLTIMA PEÇA "P"');
    expect(await priceRow()).toBeCloseTo(rowBefore, 1); // a linha do aviso já estava reservada
    await content.getByRole("button", { name: "M", exact: true }).click();
    await expect(auto).toHaveText('POUCAS UNIDADES "M"');
    expect(await auto.evaluate(el => el.scrollWidth <= el.clientWidth && el.getBoundingClientRect().right <= innerWidth)).toBe(true);
    await photo.evaluate(el => window.scrollTo(0, window.scrollY + el.getBoundingClientRect().top - 120));
    if (!touch) await photo.getByRole("img").hover();
    const metrics = await manual.evaluate(el => {
      const label = el.querySelector<HTMLElement>(".product-tag-label")!, text = label.firstElementChild as HTMLElement;
      const bounds = el.getBoundingClientRect(), frame = el.closest(".store-product-photo")!.getBoundingClientRect();
      return { font: getComputedStyle(label).fontSize, fits: text.scrollWidth <= label.clientWidth && text.scrollHeight <= label.clientHeight,
        textInside: text.getBoundingClientRect().bottom <= bounds.bottom, height: bounds.height, width: bounds.width,
        clip: getComputedStyle(el.parentElement!).clipPath, bottom: bounds.bottom - frame.bottom };
    });
    expect(metrics.font).toBe("12px");
    expect(metrics).toMatchObject({ fits: true, textInside: true, clip: "inset(-1px 0px -2%)" });
    expect(metrics.width).toBeCloseTo(defaultManual.width * 1.5, 1);
    expect(metrics.height).toBeCloseTo(defaultManual.height * 1.5, 1);
    expect(metrics.bottom).toBeGreaterThan(0); expect(metrics.bottom).toBeLessThan(metrics.height * 0.15);
    await expect(manual).toHaveCSS("transform", "none");
    await expect(manual).toHaveAttribute("data-badge-size", "detail");
    const afterPhoto = (await photo.boundingBox())!;
    expect(afterPhoto.width).toBe(originalPhoto!.width); expect(afterPhoto.height).toBe(originalPhoto!.height);
    await photo.screenshot({ path: info.outputPath(`detail-scale-${width}-${touch ? "touch" : "desktop"}.png`) });
    await page.getByRole("button", { name: "Voltar para a loja" }).click();
    await expect(page.locator('[data-badge-size="detail"]')).toHaveCount(0);
    const catalogCard = page.locator(".store-product-card").filter({ has: page.getByText("Produto detalhe badges", { exact: true }) });
    await catalogCard.getByRole("button", { name: "P", exact: true }).click();
    await expect(catalogCard.locator(".store-badge-automatic")).toHaveText('ÚLTIMA PEÇA "P"');
    await expect(catalogCard.locator(".store-badge-automatic")).toHaveCSS("font-size", "11px");
    expect((await catalogCard.locator(".store-badge-manual").boundingBox())!.width).toBeCloseTo(89.6, 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
});

test("detail multicolor badges need an explicit color and never borrow another variant stock", async ({ page }) => {
  await setup(page, true);
  const content = page.locator(".store-product-detail-content"), auto = content.locator(".store-product-price .store-badge-automatic");
  await content.getByRole("button", { name: "P", exact: true }).click(); await expect(auto).toHaveCount(0);
  await content.getByRole("button", { name: "Preto", exact: true }).click(); await expect(auto).toHaveText('ÚLTIMA PEÇA "P"');
  await content.getByRole("button", { name: "Branco", exact: true }).click(); await expect(auto).toHaveText('POUCAS UNIDADES "P"');
  await expect(content.getByRole("button", { name: "M", exact: true })).toBeDisabled();
  await content.getByRole("button", { name: "P", exact: true }).click(); await expect(auto).toHaveCount(0);
  await expect(content.getByRole("button", { name: "Selecione o tamanho", exact: true })).toBeDisabled();
});
