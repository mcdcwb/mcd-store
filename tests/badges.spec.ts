import { test, expect } from "@playwright/test";

import { badgeShape, automaticBadgeShape, manualBadgeViewBox, manualBadgeDimensions } from "../src/app/components/ProductBadge";

for (const width of [320, 390, 768, 1440]) test(`automatic badges share readable typography at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await page.route("**/api/produtos", route => route.fulfill({ json: [1, 3].map((stock, index) => ({
    id: 9600 + index, name: `Typography ${index}`, price: 30, public: "unissex", category: "camisetas",
    colors: [{ id: 9600 + index, colorName: "Preto", colorValue: "#111111", images: [], variants: [{ id: 9600 + index, value: "P", stock }] }]
  })) }));
  await page.route("**/api/settings/public", route => route.fulfill({ json: { address: null, whatsapp: null, lowStockThreshold: 5, showLowStockBadge: true, showLastUnitBadge: true } }));
  await page.goto("/");
  await expect(page.locator(".store-product-card")).toHaveCount(2);
  for (const card of await page.locator(".store-product-card").all()) await card.getByRole("button", { name: "P", exact: true }).click();
  await expect(page.locator(".store-badge-automatic")).toHaveCount(2);
  const metrics = await page.locator(".store-badge-automatic").evaluateAll(elements => elements.map(el => {
    const label = el.querySelector<HTMLElement>(".product-tag-label")!, text = label.firstElementChild as HTMLElement, style = getComputedStyle(label);
    const bounds = el.getBoundingClientRect();
    return { lastUnit: el.classList.contains("store-stock-last"), font: style.fontSize, weight: style.fontWeight, line: style.lineHeight, family: style.fontFamily, height: bounds.height, widthScale: bounds.width / parseFloat(getComputedStyle(el).width), fits: text.scrollWidth <= label.clientWidth && text.scrollHeight <= label.clientHeight, textTransform: getComputedStyle(text).transform };
  }));
  expect(metrics).toHaveLength(2);
  for (const metric of metrics) {
    const compactBadge = width === 320;
    const mobile = width < 768;
    expect(metric).toMatchObject({ font: mobile ? compactBadge ? "9px" : "10px" : compactBadge ? "9px" : "9.9px", weight: "700", line: mobile ? compactBadge ? "9.9px" : "11px" : compactBadge ? "9.9px" : "10.89px", fits: true, textTransform: "none" });
    expect(metric.height).toBeCloseTo(mobile ? 18 : 12, 3);
    expect(metric.widthScale).toBeCloseTo(mobile ? 1.5 : 1, 3);
  }
  expect(metrics[0].family).toBe(metrics[1].family);
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
    return { width: bounds.width, height: bounds.height, bottomGap: photo.bottom - bounds.bottom, leftGap: bounds.left - card.left, inside: bounds.top >= photo.top && bounds.right <= photo.right && text.getBoundingClientRect().bottom <= bounds.bottom && getComputedStyle(badge.parentElement!).clipPath === "inset(-1px 0px -2%)", fits: text.scrollHeight <= text.clientHeight && text.scrollWidth <= text.clientWidth,
      outsideTip: area.right <= tip.x, centered: Math.abs(text.getBoundingClientRect().top + text.getBoundingClientRect().height / 2 - bounds.top - bounds.height / 2) < 1 };
  }));
  for (const badge of geometry) { expect(badge.width).toBeCloseTo(89.6, 1); expect(badge.height).toBeCloseTo(27.9576, 1); expect(badge.bottomGap).toBeLessThan(0); expect(badge.bottomGap).toBeGreaterThan(-3.1); expect(badge.leftGap).toBeCloseTo(0, 2); expect(badge).toMatchObject({ fits: true, outsideTip: true, centered: true, inside: true }); }
  expect(geometry.every(badge => badge.width === geometry[0].width && badge.height === geometry[0].height)).toBe(true);
  await expect(manual.first().locator("path")).toHaveAttribute("fill", "#ABCDEF");
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
  await page.route("**/api/settings/public", route => route.fulfill({ json: { address: null, whatsapp: null, lowStockThreshold: 5, showLowStockBadge: true, showLastUnitBadge: true } }));
  await page.goto("/");
  const card = page.locator(".store-product-card"), badge = card.locator(".store-badge-automatic");
  await expect(badge).toHaveCount(0);
  await expect(card.locator(".store-badge-manual")).toBeVisible();
  await card.getByRole("button", { name: "P", exact: true }).click();
  await expect(badge).toHaveAccessibleName("ÚLTIMA PEÇA");
  await expect(badge.locator("path")).toHaveAttribute("fill", "#B42332");
  await card.getByRole("button", { name: "M", exact: true }).click();
  await expect(badge).toHaveAccessibleName("POUCAS UNIDADES");
  await expect(badge.locator("path")).toHaveAttribute("fill", "#F4EC03");
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
  await page.route("**/api/settings/public", route => route.fulfill({ json: { address: null, whatsapp: null, lowStockThreshold: 5, showLowStockBadge: true, showLastUnitBadge: true } }));
  await page.goto("/");
  const card = page.locator(".store-product-card"), badge = card.locator(".store-badge-automatic");
  const swatches = card.getByRole("group", { name: "Selecionar cor" }).getByRole("button");
  await expect(swatches.first()).toHaveCSS("border-radius", "3px");
  await expect(swatches.first().locator("..")).toHaveCSS("column-gap", "8px");
  await card.getByRole("button", { name: "Preto", exact: true }).click();
  await expect(badge).toHaveCount(0);
  await card.getByRole("button", { name: "P", exact: true }).click();
  await expect(badge).toHaveAccessibleName("ÚLTIMA PEÇA");
  await card.getByRole("button", { name: "Branco", exact: true }).click();
  await expect(badge).toHaveCount(0);
  await card.getByRole("button", { name: "Preto", exact: true }).click();
  await expect(badge).toHaveAccessibleName("ÚLTIMA PEÇA");
  await card.getByRole("button", { name: "M", exact: true }).click();
  await expect(badge).toHaveAccessibleName("POUCAS UNIDADES");
  await card.getByRole("button", { name: "Branco", exact: true }).click();
  await expect(card.getByRole("button", { name: "M", exact: true })).not.toHaveAttribute("aria-pressed", "true");
  await expect(badge).toHaveCount(0);
});

for (const touch of [false, true]) for (const width of [320, 390, 768, 1440]) {
  test.describe(`badge ${touch ? "touch" : "desktop"} ${width}`, () => {
    test.use({ viewport: { width, height: 1000 }, hasTouch: touch, isMobile: touch });
    test("half-height, whole-card reveal, explicit variants and fixed manual slot", async ({ page }, info) => {
      const products = [1, 3].map((stock, index) => ({ id: 9700 + index, name: `Badge motion ${index}`, price: 30, public: "unissex", category: "camisetas", badge: "MANUAL", badgeBackgroundColor: "#2457A7", badgeTextColor: "#FFFFFF",
        colors: [{ id: 9700 + index, colorName: "Preto", colorValue: "#111111", images: ["/badge-motion-light.svg", "/badge-motion-dark.svg"], variants: [{ id: 9700 + index, value: "P", stock }, { id: 9800 + index, value: "G", stock: 10 }] },
          { id: 9900 + index, colorName: "Branco", colorValue: "#FFFFFF", images: [], variants: [{ id: 9950 + index, value: "P", stock: 5 }] }] }));
      await page.route("**/api/produtos", route => route.fulfill({ json: products }));
      await page.route("**/api/settings/public", route => route.fulfill({ json: { address: null, whatsapp: null, lowStockThreshold: 5, showLowStockBadge: true, showLastUnitBadge: true } }));
      await page.route("**/badge-motion-*.svg", route => route.fulfill({ contentType: "image/svg+xml", body: `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500"><rect width="400" height="500" fill="${route.request().url().includes("light") ? "#eeeeee" : "#111111"}"/></svg>` }));
      await page.goto("/");
      const cards = page.locator(".store-product-card");
      const card = cards.first(), automatic = card.locator(".store-badge-automatic"), other = cards.nth(1).locator(".store-badge-automatic"), manual = card.locator(".store-badge-manual");
      await expect(page.locator(".store-badge-automatic")).toHaveCount(0);
      for (const current of [card, cards.nth(1)]) {
        await current.getByRole("button", { name: "P", exact: true }).click();
        await expect(current.locator(".store-badge-automatic")).toHaveCount(0);
        await current.getByRole("button", { name: "Preto", exact: true }).click();
      }
      await card.evaluate(el => window.scrollTo(0, window.scrollY + el.getBoundingClientRect().top - 120));
      await page.mouse.move(0, 0);
      await expect(automatic).toHaveAttribute("role", "note");
      await expect(automatic).toHaveAccessibleName("ÚLTIMA PEÇA");
      await expect(other).toHaveAccessibleName("POUCAS UNIDADES");
      const paintedTop = await automatic.evaluate(el => {
        const path = el.querySelector<SVGPathElement>("path")!, bounds = path.getBBox();
        const painted = new DOMPoint(bounds.x, bounds.y).matrixTransform(path.getScreenCTM()!);
        return painted.y - el.closest(".store-product-card")!.getBoundingClientRect().top;
      });
      expect(paintedTop).toBeCloseTo(0, 2); // Cover the border at the photograph's outer top edge.
      await expect(manual).not.toHaveAttribute("tabindex");
      for (const badge of [automatic, other, manual]) {
        await expect(badge.locator("svg")).toHaveCSS("filter", "drop-shadow(rgba(0, 0, 0, 0.45) 0px 3px 5px)");
        await expect(badge.locator("path")).toHaveAttribute("d", badge === manual ? badgeShape : automaticBadgeShape);
        await expect(badge).toHaveCSS("border-radius", "0px");
        await expect(badge.locator("svg")).toHaveAttribute("viewBox", badge === manual ? manualBadgeViewBox : "0 0 1792 388.3");
      }
      for (const badge of [automatic, other]) {
        const size = await badge.boundingBox();
        expect(size!.height).toBeCloseTo(width < 768 ? 18 : 12, 3);
        const baseWidth = await badge.evaluate(el => parseFloat(getComputedStyle(el).width));
        expect(size!.width).toBeCloseTo(baseWidth * (width < 768 ? 1.5 : 1), 2);
        const paintedHeight = await badge.evaluate(el => {
          const path = el.querySelector<SVGPathElement>("path")!, box = path.getBBox(), matrix = path.getScreenCTM()!;
          return new DOMPoint(0, box.y + box.height).matrixTransform(matrix).y - new DOMPoint(0, box.y).matrixTransform(matrix).y;
        });
        expect(paintedHeight).toBeCloseTo(width < 768 ? 18 : 12, 3);
        const textCenter = await badge.evaluate(el => {
          const outer = el.getBoundingClientRect(), text = el.querySelector(".product-tag-label > span")!.getBoundingClientRect();
          return text.top + text.height / 2 - outer.top - outer.height / 2;
        });
        expect(Math.abs(textCenter)).toBeLessThan(0.05);
        await expect(badge.locator("svg")).toHaveAttribute("preserveAspectRatio", "none");
      }
      const manualSize = await manual.boundingBox();
      await expect(card.locator(".store-product-badges")).toHaveCSS("clip-path", "inset(-1px 0px -2%)");
      const clipFrame = await card.evaluate(el => {
        const clip = el.querySelector(".store-product-badges")!.getBoundingClientRect(), outer = el.getBoundingClientRect(), photo = el.querySelector(".store-product-photo")!.getBoundingClientRect();
        return { left: clip.left - outer.left, top: clip.top - 1 - outer.top, bottom: clip.bottom - photo.bottom, right: clip.right - photo.right };
      });
      for (const edge of Object.values(clipFrame)) expect(edge).toBeCloseTo(0, 1);
      expect(manualSize!.width).toBeCloseTo(manualBadgeDimensions.width, 1);
      expect(manualSize!.height).toBeCloseTo(manualBadgeDimensions.height, 1);
      const bottomAlignment = await manual.evaluate(el => el.closest(".store-product-photo")!.getBoundingClientRect().bottom - el.getBoundingClientRect().bottom);
      expect(bottomAlignment).toBeLessThan(0);
      expect(bottomAlignment).toBeGreaterThan(-3.1);
      const retracted = () => automatic.evaluate(el => {
        const matrix = new DOMMatrixReadOnly(getComputedStyle(el).transform), scale = innerWidth < 768 ? 1.5 : 1;
        return Math.abs(matrix.a - scale) < 0.001 && Math.abs(matrix.m41 / (el.getBoundingClientRect().width / scale) + 0.85) < 0.001;
      });
      const expandedTransform = width < 768 ? "matrix(1.5, 0, 0, 1, 0, 0)" : "matrix(1, 0, 0, 1, 0, 0)";
      if (touch) await expect(automatic).toHaveCSS("transform", width < 768 ? "matrix(1.5, 0, 0, 1, 0, 0)" : "none");
      else {
        await expect.poll(retracted).toBe(true);
        await card.getByText("Badge motion 0", { exact: true }).hover();
        await expect(automatic).toHaveCSS("transform", expandedTransform);
        await page.mouse.move(0, 0); await expect.poll(retracted).toBe(true);
      }
      const original = await card.evaluate(el => {
        const photo = el.firstElementChild!.getBoundingClientRect(), outer = el.getBoundingClientRect(), manual = el.querySelector(".store-badge-manual")!.getBoundingClientRect();
        return { width: photo.width, height: photo.height, cardHeight: outer.height, manualTop: manual.top - photo.top, manualLeft: manual.left - outer.left };
      });
      expect(original.manualLeft).toBeCloseTo(0, 2);
      expect(original.height).toBeCloseTo(original.width * 1.25, 1);
      await card.screenshot({ path: info.outputPath("badge-retracted-light.png") });
      await expect(manual).toHaveCSS("transform", "none");
      await manual.hover({ force: true });
      await expect(manual).toHaveCSS("transform", "none");
      if (!touch) {
        await page.mouse.move(0, 0); await expect.poll(retracted).toBe(true);
        // Hover the painted tab, not the off-card bounding box's center.
        const photo = await card.locator(".store-product-photo").boundingBox();
        const badge = await automatic.boundingBox();
        await page.mouse.move(photo!.x - 1 + badge!.width * 0.12, badge!.y + badge!.height / 2);
        await expect(automatic).toHaveCSS("transform", expandedTransform);
        await expect(other).not.toHaveCSS("transform", expandedTransform);
        await expect(automatic).toHaveCSS("transition-duration", "0.225s, 0.225s");
        const expanded = await automatic.boundingBox();
        expect(expanded!.width).toBeCloseTo(badge!.width, 2); expect(expanded!.height).toBeCloseTo(badge!.height, 2);
        const outer = await card.boundingBox(); expect(expanded!.x - outer!.x).toBeCloseTo(0, 2);
        await card.screenshot({ path: info.outputPath("badge-expanded-light.png") });
        for (const target of [card.getByRole("img"), card.getByText("R$ 30,00", { exact: true }), card.getByRole("button", { name: "Adicionar ao carrinho", exact: true })]) {
          await target.hover();
          await expect(automatic).toHaveCSS("transform", expandedTransform);
          await expect(other).not.toHaveCSS("transform", expandedTransform);
        }
        await page.mouse.move(0, 0); await expect.poll(retracted).toBe(true);
      }
      await automatic.focus(); await page.keyboard.press("Tab"); await page.keyboard.press("Shift+Tab");
      await expect(automatic).toBeFocused();
      await expect(automatic).toHaveCSS("outline-style", "solid");
      await expect(automatic).toHaveCSS("transform", touch ? width < 768 ? "matrix(1.5, 0, 0, 1, 0, 0)" : "none" : expandedTransform);
      const clipping = await automatic.evaluate(el => ({ photo: getComputedStyle(el.closest(".store-product-photo")!).overflow, card: getComputedStyle(el.closest(".store-product-card")!).overflow, image: getComputedStyle(el.closest(".store-product-photo")!.querySelector("a")!).overflow }));
      expect(clipping).toEqual({ photo: "visible", card: "visible", image: "hidden" });
      await card.getByRole("button", { name: "G", exact: true }).click();
      await expect(automatic).toHaveCount(0);
      expect(await manual.evaluate(el => el.getBoundingClientRect().top - el.closest(".store-product-photo")!.getBoundingClientRect().top)).toBeCloseTo(original.manualTop, 2);
      await card.getByRole("button", { name: "P", exact: true }).click();
      await page.emulateMedia({ reducedMotion: "reduce" });
      await expect(automatic).toHaveCSS("transition-duration", "0s");
      await card.evaluate(el => window.scrollTo(0, window.scrollY + el.getBoundingClientRect().top - 120));
      await card.getByRole("img").hover();
      await card.getByRole("button", { name: "Próxima imagem", exact: true }).focus();
      await page.keyboard.press("Enter");
      await expect(card.getByRole("img")).toHaveAttribute("src", "/badge-motion-dark.svg");
      await automatic.focus(); await page.keyboard.press("Tab"); await page.keyboard.press("Shift+Tab");
      await card.evaluate(el => window.scrollTo(0, window.scrollY + el.getBoundingClientRect().top - 120));
      await card.screenshot({ path: info.outputPath("badge-expanded-dark.png") });
      const final = await card.evaluate(el => {
        const photo = el.firstElementChild!.getBoundingClientRect(), outer = el.getBoundingClientRect();
        return { width: photo.width, height: photo.height, cardHeight: outer.height };
      });
      expect(final.width).toBeCloseTo(original.width, 2);
      expect(final.height).toBeCloseTo(original.height, 2);
      expect(final.cardHeight).toBeCloseTo(original.cardHeight, 2);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const clear = await cards.evaluateAll(elements => {
        const overlaps = (a: DOMRect, b: DOMRect) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
        const controls = elements.flatMap(el => [...el.querySelectorAll<HTMLElement>(".store-product-photo .store-image-control, .store-product-photo .store-favorite-bookmark path, .store-product-photo-pagination button")].map(element => ({ element, bounds: element.getBoundingClientRect() })));
        return elements.flatMap(el => [...el.querySelectorAll(".product-tag")].flatMap(badge => {
          const bounds = badge.getBoundingClientRect();
          const clip = getComputedStyle(badge).clipPath;
          const left = clip.startsWith("inset(") ? parseFloat(clip.slice(6, -1).split(" ")[3] ?? "0") / 100 : 0;
          const painted = new DOMRect(bounds.x + bounds.width * left, bounds.y, bounds.width * (1 - left), bounds.height);
          return controls.filter(({ bounds, element }) => {
            if (!overlaps(painted, bounds)) return false;
            const favoriteLayer = element.closest(".store-favorite-layer");
            return !favoriteLayer || Number(getComputedStyle(favoriteLayer).zIndex) <= Number(getComputedStyle(badge.parentElement!).zIndex);
          }).map(({ bounds: control }) => ({ label: badge.textContent, clip, painted: painted.toJSON(), control: control.toJSON() }));
        }));
      });
      expect(clear).toEqual([]);
    });
  });
}
