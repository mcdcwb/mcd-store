import { test, expect, type Locator } from "@playwright/test";

import { badgeShape, manualBadgeViewBox, manualBadgeDimensions } from "../src/app/components/ProductBadge";

// Selo automático de estoque ("ÚLTIMA PEÇA"/"POUCAS UNIDADES"): texto ao lado do preço, com o tamanho
// escolhido no nome (desde 27/10/2026). Selo manual: etiqueta SVG fixa no rodapé da foto.
const LAST = "rgb(180, 35, 50)", LOW = "rgb(240, 180, 41)";
const settingsJson = { address: null, whatsapp: null, lowStockThreshold: 5, showLowStockBadge: true, showLastUnitBadge: true };

// Mesma geometria, tolerando só arredondamento de subpixel (< 0,05px).
function expectSameGeometry(actual: Record<string, number>, expected: Record<string, number>) {
  for (const key of Object.keys(expected)) expect(actual[key], key).toBeCloseTo(expected[key], 1);
}

// O aviso cabe no card (sem cortar texto) e na janela.
async function fitsInCard(badge: Locator) {
  return badge.evaluate(el => {
    const card = el.closest(".store-product-card, .store-product-detail-content")!.getBoundingClientRect(), box = el.getBoundingClientRect();
    return el.scrollWidth <= el.clientWidth && box.left >= card.left - 0.5 && box.right <= card.right + 0.5 && box.right <= innerWidth;
  });
}

for (const width of [320, 390, 768, 1440]) test(`automatic badges share readable typography at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await page.route("**/api/produtos", route => route.fulfill({ json: [1, 3].map((stock, index) => ({
    id: 9600 + index, name: `Typography ${index}`, price: 30, public: "unissex", category: "camisetas",
    colors: [{ id: 9600 + index, colorName: "Preto", colorValue: "#111111", images: [], variants: [{ id: 9600 + index, value: "P", stock }] }]
  })) }));
  await page.route("**/api/settings/public", route => route.fulfill({ json: settingsJson }));
  await page.goto("/");
  await expect(page.locator(".store-product-card")).toHaveCount(2);
  for (const card of await page.locator(".store-product-card").all()) await card.getByRole("button", { name: "P", exact: true }).click();
  const badges = page.locator(".store-badge-automatic");
  await expect(badges).toHaveText(['ÚLTIMA PEÇA "P"', 'POUCAS UNIDADES "P"']);
  const metrics = await badges.evaluateAll(elements => elements.map(el => {
    const style = getComputedStyle(el);
    return { font: style.fontSize, weight: style.fontWeight, family: style.fontFamily, height: el.getBoundingClientRect().height,
      inPriceRow: !!el.closest(".store-product-price"), overPhoto: !!el.closest(".store-product-photo") };
  }));
  for (const metric of metrics) {
    expect(metric).toMatchObject({ font: "11px", weight: "600", inPriceRow: true, overPhoto: false });
    // Uma linha (22,5px) ou, no card estreito, até duas (39px) — sempre dentro do card.
    expect(metric.height).toBeGreaterThanOrEqual(22.4); expect(metric.height).toBeLessThanOrEqual(39.1);
  }
  expect(metrics[0].family).toBe(metrics[1].family);
  for (const badge of await badges.all()) expect(await fitsInCard(badge)).toBe(true);
  await expect(badges.first()).toHaveCSS("background-color", LAST);
  await expect(badges.first()).toHaveCSS("color", "rgb(255, 255, 255)");
  await expect(badges.nth(1)).toHaveCSS("background-color", LOW);
  await expect(badges.nth(1)).toHaveCSS("color", "rgb(44, 26, 0)");
});

for (const width of [320, 390, 768, 1440]) test(`manual badges have fixed geometry and twelve characters fit at ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 900 });
  const labels = ["NOVIDADE", "LANÇAMENTO", "WWWWWWWWWWWW", "123456789012"];
  await page.route("**/api/produtos", route => route.fulfill({ json: labels.map((badge, index) => ({
    id: 9000 + index, name: badge, price: "30.00", public: "unissex", isPublished: true, category: { id: 1, name: "Camisetas" },
    badge, badgeBackgroundColor: "#ABCDEF", badgeTextColor: "#123456", colors: [{ id: 9100 + index, colorName: "Preto", colorValue: "#111111", images: [], variants: [{ id: 9200 + index, value: "P", stock: 1 }] }]
  })) }));
  await page.goto("/");
  const manual = page.locator(".store-badge-manual"); await expect(manual).toHaveCount(4);
  const geometry = await manual.evaluateAll(badges => badges.map(badge => {
    const bounds = badge.getBoundingClientRect(), text = badge.querySelector<HTMLElement>(".product-tag-label > span")!, area = badge.querySelector(".product-tag-label")!.getBoundingClientRect();
    const tip = new DOMPoint(94.1125, 0).matrixTransform(badge.querySelector<SVGPathElement>("path")!.getScreenCTM()!);
    const photo = badge.closest(".store-product-photo")!.getBoundingClientRect(), card = badge.closest(".store-product-card")!.getBoundingClientRect();
    return { width: bounds.width, height: bounds.height, bottomGap: photo.bottom - bounds.bottom, leftGap: bounds.left - card.left, inside: bounds.top >= photo.top && bounds.right <= photo.right && text.getBoundingClientRect().bottom <= bounds.bottom &&
      text.scrollWidth <= text.clientWidth + 0.5, outsideTip: area.right <= tip.x, centered: Math.abs(text.getBoundingClientRect().top + text.getBoundingClientRect().height / 2 - bounds.top - bounds.height / 2) < 1 };
  }));
  for (const badge of geometry) {
    expect(badge.width).toBeCloseTo(89.6, 1); expect(badge.height).toBeCloseTo(27.9576, 1);
    // Rente ao rodapé da foto (no máximo 3,1px para fora, cobrindo a borda).
    expect(badge.bottomGap).toBeLessThanOrEqual(0.5); expect(badge.bottomGap).toBeGreaterThan(-3.1);
    expect(badge.leftGap).toBeCloseTo(0, 2); expect(badge).toMatchObject({ inside: true, outsideTip: true, centered: true });
  }
  expect(geometry.every(badge => badge.width === geometry[0].width && badge.height === geometry[0].height)).toBe(true);
  await expect(manual.first().locator("path")).toHaveAttribute("fill", "#ABCDEF");
  await expect(manual.first().locator("path")).toHaveAttribute("d", badgeShape);
  await expect(manual.first().locator("svg")).toHaveAttribute("viewBox", manualBadgeViewBox);
  await expect(manual.first()).toHaveCSS("color", "rgb(18, 52, 86)");
  await expect(manual.first()).toHaveCSS("transform", "none");
  await page.locator(".store-product-card").first().screenshot({ path: info.outputPath(`manual-fixed-${width}.png`) });
});

test("single-color API products need only an explicit size; changes and deselection update stock", async ({ page }) => {
  await page.route("**/api/produtos", route => route.fulfill({ json: [{
    id: 9900, name: "Seleção por tamanho", price: "30.00", public: "unissex", category: { id: 1, name: "Camisetas" }, isPublished: true,
    badge: "MANUAL", colors: [{ id: 9901, colorName: "Preto", colorValue: "#111111", images: [],
      variants: [{ id: 9902, value: "P", stock: 1 }, { id: 9903, value: "M", stock: 5 }, { id: 9904, value: "G", stock: 6 }, { id: 9905, value: "GG", stock: 0 }] }]
  }] }));
  await page.route("**/api/settings/public", route => route.fulfill({ json: settingsJson }));
  await page.goto("/");
  const card = page.locator(".store-product-card"), badge = card.locator(".store-badge-automatic");
  await expect(badge).toHaveCount(0);
  await expect(card.locator(".store-badge-manual")).toBeVisible();
  await card.getByRole("button", { name: "P", exact: true }).click();
  await expect(badge).toHaveText('ÚLTIMA PEÇA "P"');
  await expect(badge).toHaveCSS("background-color", LAST);
  await card.getByRole("button", { name: "M", exact: true }).click();
  await expect(badge).toHaveText('POUCAS UNIDADES "M"');
  await expect(badge).toHaveCSS("background-color", LOW);
  await card.getByRole("button", { name: "M", exact: true }).click();
  await expect(badge).toHaveCount(0);
  await card.getByRole("button", { name: "G", exact: true }).click();
  await expect(badge).toHaveCount(0);
  await expect(card.getByRole("button", { name: "GG", exact: true })).toBeDisabled();
  await expect(card.locator(".store-badge-manual")).toBeVisible();
});

test("multicolor selections use square spaced color swatches and exact variant stock", async ({ page }) => {
  await page.route("**/api/produtos", route => route.fulfill({ json: [{
    id: 9910, name: "Seleção completa", price: "30.00", public: "unissex", category: { id: 1, name: "Camisetas" }, isPublished: true,
    colors: [
      { id: 9911, colorName: "Preto", colorValue: "#111111", images: [], variants: [{ id: 9921, value: "P", stock: 1 }, { id: 9922, value: "M", stock: 5 }] },
      { id: 9912, colorName: "Branco", colorValue: "#FFFFFF", images: [], variants: [{ id: 9923, value: "P", stock: 8 }, { id: 9924, value: "M", stock: 0 }] }
    ]
  }] }));
  await page.route("**/api/settings/public", route => route.fulfill({ json: settingsJson }));
  await page.goto("/");
  const card = page.locator(".store-product-card"), badge = card.locator(".store-badge-automatic");
  const swatches = card.getByRole("group", { name: "Selecionar cor" }).getByRole("button");
  await expect(swatches.first()).toHaveCSS("border-radius", "3px");
  await expect(swatches.first().locator("..")).toHaveCSS("column-gap", "8px");
  await card.getByRole("button", { name: "Preto", exact: true }).click();
  await expect(badge).toHaveCount(0);
  await card.getByRole("button", { name: "P", exact: true }).click();
  await expect(badge).toHaveText('ÚLTIMA PEÇA "P"');
  await card.getByRole("button", { name: "Branco", exact: true }).click();
  await expect(badge).toHaveCount(0);
  await card.getByRole("button", { name: "Preto", exact: true }).click();
  await expect(badge).toHaveText('ÚLTIMA PEÇA "P"');
  await card.getByRole("button", { name: "M", exact: true }).click();
  await expect(badge).toHaveText('POUCAS UNIDADES "M"');
  await card.getByRole("button", { name: "Branco", exact: true }).click();
  await expect(card.getByRole("button", { name: "M", exact: true })).not.toHaveAttribute("aria-pressed", "true");
  await expect(badge).toHaveCount(0);
});

for (const touch of [false, true]) for (const width of [320, 390, 768, 1440]) {
  test.describe(`badge ${touch ? "touch" : "desktop"} ${width}`, () => {
    test.use({ viewport: { width, height: 1000 }, hasTouch: touch, isMobile: touch });
    test("price-row stock notice keeps the photo, the manual slot and the card height fixed", async ({ page }, info) => {
      const products = [1, 3].map((stock, index) => ({ id: 9700 + index, name: `Badge motion ${index}`, price: 30, public: "unissex", category: "camisetas", badge: "MANUAL", badgeBackgroundColor: "#2457A7", badgeTextColor: "#FFFFFF",
        colors: [{ id: 9700 + index, colorName: "Preto", colorValue: "#111111", images: ["/badge-motion-light.svg", "/badge-motion-dark.svg"], variants: [{ id: 9700 + index, value: "P", stock }, { id: 9800 + index, value: "G", stock: 10 }, { id: 9850 + index, value: "GG", stock: 2 }] },
          { id: 9900 + index, colorName: "Branco", colorValue: "#FFFFFF", images: [], variants: [{ id: 9950 + index, value: "P", stock: 5 }] }] }));
      await page.route("**/api/produtos", route => route.fulfill({ json: products }));
      await page.route("**/api/settings/public", route => route.fulfill({ json: settingsJson }));
      await page.route("**/badge-motion-*.svg", route => route.fulfill({ contentType: "image/svg+xml", body: `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500"><rect width="400" height="500" fill="${route.request().url().includes("light") ? "#f4f1ea" : "#202326"}"/></svg>` }));
      await page.goto("/");
      const cards = page.locator(".store-product-card");
      const card = cards.first(), automatic = card.locator(".store-badge-automatic"), other = cards.nth(1).locator(".store-badge-automatic"), manual = card.locator(".store-badge-manual");
      await expect(page.locator(".store-badge-automatic")).toHaveCount(0);
      const measure = () => card.evaluate(el => {
        const photo = el.querySelector(".store-product-photo")!.getBoundingClientRect(), outer = el.getBoundingClientRect(), manual = el.querySelector(".store-badge-manual")!.getBoundingClientRect();
        return { width: photo.width, height: photo.height, cardHeight: outer.height, manualTop: manual.top - photo.top, manualLeft: manual.left - outer.left };
      });
      const original = await measure();
      expect(original.manualLeft).toBeCloseTo(0, 2);
      expect(original.height).toBeCloseTo(original.width * 1.25, 1);
      // Cor e tamanho explícitos: o aviso só aparece com a variante escolhida.
      for (const current of [card, cards.nth(1)]) {
        await current.getByRole("button", { name: "P", exact: true }).click();
        await expect(current.locator(".store-badge-automatic")).toHaveCount(0);
        await current.getByRole("button", { name: "Preto", exact: true }).click();
      }
      await expect(automatic).toHaveText('ÚLTIMA PEÇA "P"');
      await expect(other).toHaveText('POUCAS UNIDADES "P"');
      await expect(automatic).toHaveAttribute("aria-live", "polite");
      // O aviso fica na linha do preço: nunca sobre a foto, sem cortar texto, e não muda a altura do card.
      for (const badge of [automatic, other]) {
        expect(await badge.evaluate(el => !!el.closest(".store-product-price") && !el.closest(".store-product-photo"))).toBe(true);
        expect(await fitsInCard(badge)).toBe(true);
      }
      const withNotice = await measure();
      expectSameGeometry(withNotice, original);
      await expect(manual).toHaveCSS("transform", "none");
      await expect(manual.locator("path")).toHaveAttribute("d", badgeShape);
      expect((await manual.boundingBox())!.width).toBeCloseTo(manualBadgeDimensions.width, 1);
      expect((await manual.boundingBox())!.height).toBeCloseTo(manualBadgeDimensions.height, 1);
      if (!touch) {
        await card.getByRole("img").hover();
        await expect(manual).toHaveCSS("transform", "none");
      }
      await card.screenshot({ path: info.outputPath("badge-price-row.png") });
      // O rótulo mais longo também não vaza nem muda a altura (quebrava de linha antes da linha reservada).
      await card.getByRole("button", { name: "GG", exact: true }).click();
      await expect(automatic).toHaveText('POUCAS UNIDADES "GG"');
      expect(await fitsInCard(automatic)).toBe(true);
      expectSameGeometry(await measure(), original);
      // Trocar para um tamanho com estoque some com o aviso sem mexer no card.
      await card.getByRole("button", { name: "G", exact: true }).click();
      await expect(automatic).toHaveCount(0);
      expectSameGeometry(await measure(), original);
      // Trocar de imagem também não mexe na geometria.
      await card.getByRole("button", { name: "P", exact: true }).click();
      await card.evaluate(el => window.scrollTo(0, window.scrollY + el.getBoundingClientRect().top - 120));
      await card.getByRole("img").hover();
      await card.getByRole("button", { name: "Próxima imagem", exact: true }).focus();
      await page.keyboard.press("Enter");
      await expect(card.getByRole("img")).toHaveAttribute("src", "/badge-motion-dark.svg");
      expectSameGeometry(await measure(), original);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      // Nenhum selo (manual) cobre os controles da foto.
      const clear = await cards.evaluateAll(elements => {
        const overlaps = (a: DOMRect, b: DOMRect) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
        return elements.flatMap(el => {
          const controls = [...el.querySelectorAll<HTMLElement>(".store-product-photo .store-image-control, .store-product-photo-pagination button")].map(control => control.getBoundingClientRect());
          return [...el.querySelectorAll(".product-tag")].flatMap(badge => controls.filter(control => overlaps(badge.getBoundingClientRect(), control)).map(control => ({ badge: badge.textContent, control: control.toJSON() })));
        });
      });
      expect(clear).toEqual([]);
    });
  });
}
