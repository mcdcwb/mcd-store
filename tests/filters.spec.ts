import { test, expect, type Page } from "@playwright/test";
import { badgeShape, manualBadgeViewBox } from "../src/app/components/ProductBadge";
const originalBookmark = "M21.3,28.3L16,23l-5.3,5.3C10.1,28.9,9,28.5,9,27.6V5c0-0.6,0.4-1,1-1h12c0.6,0,1,0.4,1,1v22.6 C23,28.5,21.9,28.9,21.3,28.3z";

for (const width of [320, 390, 768, 1440]) test(`automatic stock badges coexist with manual badges at ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 1000 });
  let settings = { lowStockThreshold: 5, showLowStockBadge: true, showLastUnitBadge: true };
  const stocks = [[0, 0, 1], [1, 5], [0, 10, 3], [0, 10, 8], [0, 0, 0], [4, 10]];
  const catalog = stocks.map((values, index) => ({
    id: index + 1, name: `Badge case ${index}`, price: 30, public: "unissex", category: "camisetas", badge: "EDIÇÃO ESPECIAL",
    colors: values.map((stock, color) => ({ id: index * 10 + color + 1, colorName: `Cor ${color}`, colorValue: "#111111", images: ["/badge-front.svg", "/badge-back.svg"], variants: [{ id: index * 10 + color + 1, value: "M", stock }] }))
  }));
  await page.route("**/badge-*.svg", route => route.fulfill({ contentType: "image/svg+xml", body: `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500"><rect width="100%" height="100%" fill="${route.request().url().includes("front") ? "#F7F7F7" : "#111111"}"/></svg>` }));
  await page.route("**/api/produtos", route => route.fulfill({ json: catalog }));
  await page.route("**/api/settings/public", route => route.fulfill({ json: { address: null, whatsapp: null, ...settings } }));
  await page.goto("/");
  const card = (index: number) => page.locator(".store-product-card").filter({ has: page.getByText(`Badge case ${index}`, { exact: true }) });
  const favorite = card(0).getByRole("button", { name: "Favoritar", exact: true });
  await expect(favorite).toHaveAttribute("aria-pressed", "false");
  await expect(favorite.locator("[data-bookmark-shape]")).toHaveAttribute("fill", "rgba(0, 0, 0, 0.35)");
  await expect(favorite.locator("svg")).toHaveAttribute("viewBox", "0 0 32 32");
  await expect(favorite.locator("svg path")).toHaveCount(1);
  await expect(favorite.locator("[data-bookmark-shape]")).toHaveAttribute("d", originalBookmark);
  await expect(favorite.locator("[data-bookmark-shape]")).toHaveAttribute("stroke", "#B7BEC3");
  await expect(favorite.locator("[data-bookmark-shape]")).toHaveAttribute("stroke-width", "0.96");
  await expect(favorite.locator("[data-bookmark-shape]")).toHaveAttribute("stroke-linecap", "round");
  await expect(favorite.locator("[data-bookmark-shape]")).toHaveAttribute("stroke-linejoin", "round");
  await expect(favorite.locator("[data-bookmark-shape]")).toHaveCSS("fill", "rgba(0, 0, 0, 0.35)");
  await expect(favorite.locator("[data-bookmark-shape]")).toHaveCSS("stroke", "rgb(183, 190, 195)");
  await expect(favorite.locator("rect, [data-bookmark-contrast]")).toHaveCount(0);
  await expect(favorite).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(favorite).toHaveCSS("border-width", "0px");
  await expect(favorite).toHaveCSS("outline-style", "none");
  await expect(favorite).toHaveCSS("box-shadow", "none");
  await expect(favorite.locator("svg")).toHaveCSS("filter", "drop-shadow(rgba(0, 0, 0, 0.45) 0px 3px 5px)");
  await card(0).getByText("Badge case 0", { exact: true }).hover();
  await expect.poll(() => card(0).getByRole("img", { name: "Badge case 0", exact: true }).evaluate(image =>
    getComputedStyle(image).scale.split(" ").every(value => Math.abs(parseFloat(value) / (value.endsWith("%") ? 100 : 1) - 1.05) < 0.0001)
  )).toBe(true);
  await expect(favorite).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(favorite).toHaveCSS("outline-style", "none");
  const bookmarkGeometry = await favorite.evaluate(button => {
    const photo = button.parentElement!.getBoundingClientRect();
    const hit = button.getBoundingClientRect();
    const icon = button.querySelector("svg")!.getBoundingClientRect();
    return {
      hitWidth: hit.width, hitHeight: hit.height, iconWidth: icon.width, iconHeight: icon.height,
      top: hit.top - photo.top, right: photo.right - hit.right,
      iconTop: icon.top - photo.top, iconRight: photo.right - icon.right,
      static: getComputedStyle(button).transform === "none" && button.getAnimations().length === 0
    };
  });
  expect(bookmarkGeometry.hitWidth).toBeCloseTo(44, 3);
  expect(bookmarkGeometry.hitHeight).toBeCloseTo(44, 3);
  expect(bookmarkGeometry.iconWidth).toBeCloseTo(40, 3);
  expect(bookmarkGeometry.iconHeight).toBeCloseTo(40, 3);
  expect(bookmarkGeometry.top).toBeCloseTo(-1, 3);
  expect(bookmarkGeometry.right).toBeCloseTo(-1, 3);
  expect(bookmarkGeometry.static).toBe(true);
  const paintedGap = await favorite.evaluate(button => {
    const path = button.querySelector<SVGPathElement>("[data-bookmark-shape]")!;
    const bounds = path.getBBox(), matrix = path.getScreenCTM()!;
    const edge = new DOMPoint(bounds.x + bounds.width + 0.48, bounds.y - 0.48).matrixTransform(matrix);
    const photo = button.closest(".store-product-photo")!;
    const card = button.closest(".store-product-card")!;
    const outer = card.getBoundingClientRect();
    return {
      right: outer.right - edge.x, top: edge.y - outer.top,
      cardOverflow: getComputedStyle(card).overflow,
      controlsOverflow: getComputedStyle(photo).overflow,
      photoOverflow: getComputedStyle(photo.querySelector("a")!).overflow,
      aboveBorder: Number(getComputedStyle(button).zIndex) > 0,
      static: button.querySelector("svg")!.getAnimations().length === 0
    };
  });
  expect(paintedGap.right).toBeCloseTo(8, 1);
  expect(paintedGap.top).toBeCloseTo(0, 1);
  expect(paintedGap).toMatchObject({ cardOverflow: "visible", controlsOverflow: "visible", photoOverflow: "hidden", aboveBorder: true, static: true });
  await card(0).evaluate(element => window.scrollTo(0, window.scrollY + element.getBoundingClientRect().top - 100));
  await card(0).screenshot({ path: info.outputPath(`bookmark-outline-light-${width}.png`) });
  await favorite.focus(); await page.keyboard.press("Tab"); await page.keyboard.press("Shift+Tab");
  await expect(favorite).toBeFocused();
  await expect(favorite).toHaveCSS("outline-style", "solid");
  await expect(favorite).toHaveCSS("outline-offset", "-2px");
  await expect(page.locator(".store-badge-automatic")).toHaveCount(0);
  for (const [index, color] of [[0, 2], [1, 0], [2, 2], [3, 1], [5, 0]]) {
    await card(index).getByRole("button", { name: `Cor ${color}`, exact: true }).click();
    await card(index).getByRole("button", { name: "M", exact: true }).click();
  }
  await expect(card(0).locator(".store-stock-last")).toBeVisible();
  await expect(card(0).locator(".store-stock-low")).toHaveCount(0);

  for (const index of [2, 5]) {
    await expect(card(index).locator(".store-stock-low")).toBeVisible();
  }

  for (const index of [3, 4]) {
    await expect(card(index).locator(".store-stock-last, .store-stock-low")).toHaveCount(0);
  }
  for (let index = 0; index < catalog.length; index++) {
    await expect(card(index).getByText("EDIÇÃO ESPECIAL", { exact: true })).toBeVisible();
    await expect(card(index).locator('.store-badge-manual').locator('svg')).toHaveAttribute('viewBox', manualBadgeViewBox);
    await expect(card(index).locator('.store-badge-manual').locator('path')).toHaveAttribute('d', badgeShape);
    await expect(card(index).locator('.store-badge-manual').locator('path')).toHaveAttribute('fill', '#2457A7');
    const automatic = card(index).locator(".store-badge-automatic");
    if (await automatic.count()) await automatic.focus();
    const geometry = await card(index).evaluate(element => {
      const badges = element.querySelector('[aria-label="Badges do produto"]')!;
      const image = element.querySelector("a")!.getBoundingClientRect();
      const bounds = badges.getBoundingClientRect();
      const overlaps = (a: DOMRect, b: DOMRect) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      const badge = badges.querySelector(".store-badge-manual")!;
      const badgeBounds = badge.getBoundingClientRect();

      const controls = [...badges.parentElement!.querySelectorAll(
        ".store-image-control, .store-favorite-bookmark path, .store-product-photo-pagination button"
      ),];
      return {
        fits: badges.scrollWidth <= badges.clientWidth,
        insideImage: bounds.top >= image.top && bounds.bottom <= image.bottom && bounds.left >= element.getBoundingClientRect().left - 0.1 && bounds.right <= image.right,
        clearOfControls: controls.every(control =>
          !overlaps(badgeBounds, control.getBoundingClientRect())
        ),
        labelsFit: [...badges.children].every(child => child.scrollWidth <= child.clientWidth),
        labelsOutsideTip: (() => {
          const path = badge.querySelector<SVGPathElement>("path")!;
          const tipStart = new DOMPoint(94.1125, 0).matrixTransform(path.getScreenCTM()!);
          const label = badge.querySelector(".product-tag-label")!.getBoundingClientRect();

          return label.right < tipStart.x &&
            label.top >= badgeBounds.top &&
            label.bottom <= badgeBounds.bottom;
        })(),
        static: getComputedStyle(badges).transform === "none" && badges.getAnimations().length === 0
      };
    });
    expect(geometry).toEqual({ fits: true, insideImage: true, clearOfControls: true, labelsFit: true, labelsOutsideTip: true, static: true });
  }
  for (const badge of [card(0).locator(".store-stock-last"), card(2).locator(".store-stock-low")]) {
    const contrast = await badge.evaluate(element => {
      const style = getComputedStyle(element);
      const luminance = (color: string) => color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(v => v / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
      const fg = luminance(style.color), bg = luminance(style.backgroundColor); return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
    });
    expect(contrast).toBeGreaterThanOrEqual(4.5);
  }
  // Aviso automático ao lado do preço (não mais SVG sobre a foto): fundo vermelho de "ÚLTIMA PEÇA".
  await expect(card(0).locator(".store-product-price .store-stock-last")).toHaveCSS("background-color", "rgb(180, 35, 50)");
  await card(0).getByRole("button", { name: "Cor 2", exact: true }).click();
  await expect(card(0).getByText(/^ÚLTIMA PEÇA/)).toBeVisible();
  await card(0).getByRole("button", { name: "Próxima imagem", exact: true }).click();
  await expect(card(0).getByRole("img", { name: "Badge case 0", exact: true })).toHaveAttribute("src", "/badge-back.svg");
  await expect(favorite.locator("[data-bookmark-shape]")).toHaveAttribute("fill", "rgba(0, 0, 0, 0.35)");
  await card(0).evaluate(element => window.scrollTo(0, window.scrollY + element.getBoundingClientRect().top - 100));
  await card(0).screenshot({ path: info.outputPath(`bookmark-outline-dark-${width}.png`) });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath(`stock-badges-${width}.png`), fullPage: true });
  settings = { ...settings, showLastUnitBadge: false };
  await page.evaluate(() => window.dispatchEvent(new Event("store-details-updated")));
  await expect(card(0).getByText(/^POUCAS UNIDADES/)).toBeVisible();
  await expect(card(0).getByText(/^ÚLTIMA PEÇA/)).toHaveCount(0);
  settings = { ...settings, lowStockThreshold: 3 };
  await page.evaluate(() => window.dispatchEvent(new Event("store-details-updated")));
  await expect(card(5).locator(".store-stock-low")).toHaveCount(0);
  settings = { ...settings, showLowStockBadge: false, showLastUnitBadge: true };
  await page.evaluate(() => window.dispatchEvent(new Event("store-details-updated")));
  await expect(card(0).getByText(/^ÚLTIMA PEÇA/)).toBeVisible();
  await expect(page.locator(".store-stock-low")).toHaveCount(0);
  // One badge and no badge must not change the height or add an information row.
  const originalHeight = (await card(0).boundingBox())!.height;
  catalog[0].badge = "";
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  // Sem selo manual, a área de selos da foto some; o aviso de estoque segue na linha do preço.
  await expect(card(0).locator('[aria-label="Badges do produto"]')).toHaveCount(0);
  await expect(card(0).locator(".store-product-price .store-stock-last")).toBeVisible();
  expect((await card(0).boundingBox())!.height).toBeCloseTo(originalHeight, 1);
  settings = { ...settings, showLastUnitBadge: false };
  await page.evaluate(() => window.dispatchEvent(new Event("store-details-updated")));
  await expect(card(0).locator('[aria-label="Badges do produto"]')).toHaveCount(0);
  await expect(card(0).locator(".store-badge-automatic")).toHaveCount(0);
  expect((await card(0).boundingBox())!.height).toBeCloseTo(originalHeight, 1);
});

for (const width of [320, 390, 768, 1440]) test(`public dark palette, overlays, contrast and Manager isolation at ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 1000 });
  await page.route("**/theme-product.svg", route => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500"><rect width="400" height="500" fill="#d5d2c9"/><path d="M90 110L155 80H245L310 110L280 180L255 160V400H145V160L120 180Z" fill="#202326"/></svg>' }));
  await page.route("**/api/produtos{,/admin,/carrossel}", route => route.fulfill({
    json: products.map((p, index) => ({
      ...p, inCarousel: index === 0,
      colors: [{ ...p.colors[0], images: ["/theme-product.svg"] }, { ...p.colors[0], id: p.id * 10 + 1, colorName: "Branco", colorValue: "#FFFFFF", images: ["/theme-product.svg"], variants: [{ id: p.id * 100 + 99, value: "P", stock: 2 }] }]
    }))
  }));
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-store-theme", "dark");
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(13, 15, 16)");
  const card = page.locator(".store-product-card").first(); await expect(card).toBeVisible();
  await expect(card).toHaveCSS("background-color", "rgb(24, 27, 29)");
  const slider = page.getByRole("region", { name: "Carrossel de produtos" });
  await expect(slider.getByRole("img", { name: "Camiseta API", exact: true })).toHaveCSS("object-fit", "contain");
  await expect(slider.getByRole("img", { name: "Camiseta API", exact: true })).toHaveCSS("height", width >= 640 ? "420px" : "288px");
  await expect(page.locator("footer")).toHaveCSS("background-color", "rgb(21, 24, 26)");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath(`store-${width}.png`), fullPage: true, animations: "disabled" });
  const sizes = card.getByRole("button", { name: "P", exact: true });
  await sizes.click(); await expect(sizes).toHaveAttribute("aria-pressed", "true");
  await expect(sizes).toHaveCSS("width", "48px"); await expect(sizes).toHaveCSS("height", "48px");
  await expect(sizes).toHaveCSS("background-color", "rgb(244, 236, 3)"); // primária, também com o mouse em cima
  await page.mouse.move(0, 0);
  const primaryColor = await sizes.evaluate(el => { const probe = document.createElement("span"); probe.style.color = "var(--primary)"; el.append(probe); const color = getComputedStyle(probe).color; probe.remove(); return color; });
  await expect(sizes).toHaveCSS("background-color", primaryColor);
  await expect(sizes).toHaveCSS("color", "rgb(18, 21, 0)");
  await expect(sizes).toHaveCSS("text-decoration-line", "none");
  const white = card.getByRole("button", { name: "Branco", exact: true }); await white.click();
  await expect(white).toHaveAttribute("aria-pressed", "true"); await expect(white).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await card.getByRole("button", { name: "Adicionar ao carrinho", exact: true }).click();
  const toast = page.locator('[data-sonner-toast].toast-positive').last(); await expect(toast).toBeVisible();
  await expect(toast).toHaveCSS("background-color", "rgb(18, 40, 28)");
  await page.getByRole("button", { name: "Abrir carrinho", exact: true }).click();
  const drawer = page.locator("div.shadow-2xl").filter({ has: page.getByRole("heading", { name: "Seu Carrinho" }) });
  await expect(drawer).toHaveCSS("background-color", "rgb(24, 27, 29)");
  expect(await drawer.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath(`cart-${width}.png`), animations: "disabled" });
  await page.getByRole("button", { name: "Fechar carrinho", exact: true }).click();
  if (width < 768) await page.getByRole("button", { name: "Abrir menu de navegação", exact: true }).click();
  await page.getByRole("button", { name: "Entrar", exact: true }).first().click();
  const modal = page.locator("div.shadow-2xl").filter({ has: page.getByRole("heading", { name: "Entrar", exact: true }) });
  await expect(modal).toHaveCSS("background-color", "rgb(24, 27, 29)");
  const email = page.getByLabel("E-mail", { exact: true }); await email.focus();
  await expect(email).toHaveCSS("color", "rgb(243, 244, 239)"); await expect(email).toHaveCSS("outline-style", "solid");
  const contrast = await email.evaluate(el => {
    const style = getComputedStyle(el);
    const luminance = (color: string) => color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(v => v / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
    const fg = luminance(style.color), bg = luminance(style.backgroundColor); return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
  }); expect(contrast).toBeGreaterThanOrEqual(4.5);
  await page.getByRole("button", { name: "Cadastre-se", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Criar conta", exact: true })).toBeVisible();
  const registration = page.locator("div.shadow-2xl").filter({ has: page.getByRole("heading", { name: "Criar conta", exact: true }) });
  expect(await registration.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath(`register-${width}.png`), animations: "disabled" });
  await page.getByRole("button", { name: "Fechar login ou cadastro", exact: true }).click();
  await page.goto("/manager");
  await expect(page.locator("html")).not.toHaveAttribute("data-store-theme", "dark");
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(241, 245, 248)");
  await expect(page.locator("main section")).toHaveCSS("background-color", "rgb(253, 254, 254)");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByLabel("E-mail", { exact: true })).toHaveCSS("color", "rgb(24, 50, 70)"); // --foreground do painel (0abd11d)
});

const product = (id: number, name: string, audience: string, category: string, variants: { value: string; stock: number }[]) => ({
  id, name, public: audience, categoryId: ["camisetas", "jaquetas", "calcas", "bermudas", "calcados", "vestidos"].indexOf(category) + 1, category: { id: ["camisetas", "jaquetas", "calcas", "bermudas", "calcados", "vestidos"].indexOf(category) + 1, name: ({ camisetas: "Camisetas / Camisas", jaquetas: "Jaquetas / Agasalhos", calcas: "Calças", bermudas: "Bermudas / Shorts", calcados: "Calçados", vestidos: "Vestidos" } as Record<string, string>)[category] ?? category }, price: "129.9", description: "Descrição real do catálogo",
  badge: null, colors: [{ id: id * 10, images: [], imageUrl: null, colorName: "Preto", colorValue: "#111111", variants: variants.map((v, i) => ({ ...v, id: id * 100 + i })) }]
});
const products = [
  product(901, "Camiseta API", "masculino", "camisetas", [{ value: "P", stock: 1 }, { value: "M", stock: 0 }]),
  product(902, "Jaqueta API", "unissex", "jaquetas", [{ value: "M", stock: 2 }, { value: "G", stock: 3 }]),
  product(903, "Calçado API", "feminino", "calcados", [{ value: "38", stock: 0 }, { value: "39", stock: 2 }]),
  product(904, "Camiseta Livre", "unissex", "camisetas", [{ value: "Único", stock: 4 }])
];
test.beforeEach(async ({ page }) => {
  await page.route("**/api/produtos{,/admin,/carrossel}", route => route.fulfill({ json: products }));
});

test("home category filters use subtle tracking and product card names use a slightly larger type", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 }); await page.goto("/");
  const audienceLabel = page.locator("aside section").nth(1).getByRole("button", { name: "Masculino", exact: true });
  await expect(audienceLabel).toHaveCSS("letter-spacing", "0.35px");
  const header = page.locator("header");
  await expect(header.getByRole("button", { name: "Público", exact: true })).toHaveCount(0);
  await header.getByRole("button", { name: "Categorias", exact: true }).click();
  await expect(header.getByRole("button", { name: "Camisetas / Camisas", exact: true })).toHaveCSS("letter-spacing", "0.375px");
  const productName = page.locator(".store-product-card").filter({ has: page.getByText("Camiseta API", { exact: true }) }).locator("p").first();
  await expect(productName).toHaveCSS("font-size", "17px");
});

for (const width of [320, 390, 768, 1440]) test(`product card sizes never underline and retain selection and keyboard focus at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 });
  await page.goto("/");
  const card = page.locator(".store-product-card").filter({ has: page.getByText("Camiseta API", { exact: true }) });
  const size = card.getByRole("button", { name: "P", exact: true });
  const disabled = card.getByRole("button", { name: "M", exact: true });
  await expect(size).toHaveAttribute("aria-pressed", "false");
  await expect(size).toHaveCSS("text-decoration-line", "none");
  await expect(size).toHaveCSS("width", "48px");
  await expect(size).toHaveCSS("height", "48px");
  await size.hover();
  await expect(size).toHaveCSS("text-decoration-line", "none");
  await page.mouse.down();
  await expect(size).toHaveCSS("text-decoration-line", "none");
  await page.mouse.up();
  await expect(size).toHaveAttribute("aria-pressed", "true");
  await expect(size).toHaveCSS("text-decoration-line", "none");
  await page.mouse.move(0, 0);
  const primary = await size.evaluate(element => {
    const probe = document.createElement("span"); probe.style.color = "var(--primary)"; element.append(probe);
    const primary = getComputedStyle(probe).color; probe.remove();
    return primary;
  });
  await expect(size).toHaveCSS("background-color", primary);
  await expect(size).toHaveCSS("border-color", primary);
  await size.focus(); await page.keyboard.press("Tab"); await page.keyboard.press("Shift+Tab");
  await expect(size).toBeFocused();
  await expect(size).toHaveCSS("outline-style", "solid");
  await expect(size).toHaveCSS("outline-width", "2px");
  await expect(size).toHaveCSS("text-decoration-line", "none");
  await page.keyboard.press("Space");
  await expect(size).toHaveAttribute("aria-pressed", "false");
  await expect(size).toHaveCSS("text-decoration-line", "none");
  await expect(disabled).toBeDisabled();
  await disabled.hover();
  await expect(disabled).toHaveCSS("text-decoration-line", "none");
  await expect(disabled).toHaveCSS("width", "48px");
  await expect(disabled).toHaveCSS("height", "48px");
});

for (const width of [320, 390, 768, 1440]) test(`filters and sorting omit underlines in every interaction state at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 });
  await page.goto("/");
  const sizes = width === 1440 ? page.locator("aside section").first() : page.getByRole("group", { name: "Filtrar por tamanho" });
  const size = sizes.getByRole("button", { name: "P", exact: true });
  const sorting = page.getByRole("group", { name: "Ordenar produtos" });
  const name = sorting.getByRole("button", { name: /Ordenar por nome/ });
  const price = sorting.getByRole("button", { name: /Ordenar por preço/ });
  for (const control of [size, name, price]) {
    await expect(control).toHaveCSS("text-decoration-line", "none");
    await control.hover();
    await expect(control).toHaveCSS("text-decoration-line", "none");
    await page.mouse.down();
    await expect(control).toHaveCSS("text-decoration-line", "none");
    await page.mouse.up();
    await expect(control).toHaveAttribute("aria-pressed", "true");
    await expect(control).toHaveCSS("text-decoration-line", "none");
    await control.focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    await expect(control).toBeFocused();
    await expect(control).toHaveCSS("text-decoration-line", "none");
    await expect(control).toHaveCSS("outline-style", "solid");
    await expect(control).toHaveCSS("outline-width", "2px");
  }
  await expect(size).toHaveCSS("border-width", "1px");
  await expect(price.locator("svg.lucide-arrow-up")).toBeVisible();
  const clear = page.getByRole("button", { name: "Limpar filtros", exact: true }).first();
  await clear.hover();
  await expect(clear).toHaveCSS("text-decoration-line", "none");
  await clear.focus();
  await page.keyboard.press("Tab"); await page.keyboard.press("Shift+Tab");
  await expect(clear).toBeFocused();
  await expect(clear).toHaveCSS("outline-style", "solid");
  await expect(clear).toHaveCSS("text-decoration-line", "none");
  await page.keyboard.press("Enter");
  await expect(size).toHaveAttribute("aria-pressed", "false");
  await expect(price).toHaveAttribute("aria-pressed", "true");
  // Selected dropdown/Aside options retain their background and font indicator.
  if (width < 768) await page.getByRole("button", { name: "Abrir menu de navegação", exact: true }).click();
  else if (width !== 1440) await page.locator("header").getByRole("button", { name: "Categorias", exact: true }).click();
  const options = width === 1440 ? page.locator("aside section").nth(2) : page.locator("header");
  const all = options.getByRole("button", { name: "Todos", exact: true }).first();
  await expect(all).toHaveAttribute("aria-pressed", "true");
  await expect(all).toHaveCSS("font-weight", "500"); // font-medium (o extralight de 58186e9 não era intencional)
  await all.hover();
  await expect(all).toHaveCSS("text-decoration-line", "none");
  await all.focus(); await page.keyboard.press("Tab"); await page.keyboard.press("Shift+Tab");
  await expect(all).toBeFocused();
  await expect(all).toHaveCSS("text-decoration-line", "none");
  await expect(all).toHaveCSS("outline-style", "solid");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("catalog combines audience, category and in-stock sizes across header and aside", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const aside = page.locator("aside");
  const sections = aside.locator("section");
  const [sizes, audience, category] = [sections.nth(0), sections.nth(1), sections.nth(2)];
  const header = page.locator("header");
  await expect(header.getByRole("button", { name: "Público", exact: true })).toHaveCount(0);
  const count = page.getByText(/^[0-9]+ peças? encontrad[ao]s?$/);
  await expect(count).toHaveText("4 peças encontradas");
  await expect(page.getByRole("button", { name: "Limpar filtros", exact: true })).toHaveCount(0);
  await expect(aside.locator("h3")).toHaveText(["Tamanhos", "Público", "Categoria"]);
  await audience.getByRole("button", { name: "Masculino", exact: true }).click();
  await expect(audience.getByRole("button", { name: "Masculino" })).toHaveAttribute("aria-pressed", "true");
  await header.getByRole("button", { name: "Categorias", exact: true }).click();
  await header.getByRole("button", { name: "Camisetas / Camisas", exact: true }).click();
  await expect(category.getByRole("button", { name: "Camisetas / Camisas" })).toHaveAttribute("aria-pressed", "true");
  await sizes.getByRole("button", { name: "M", exact: true }).click();
  await expect(count).toHaveText("0 peças encontradas");
  await sizes.getByRole("button", { name: "P", exact: true }).click();
  await expect(count).toHaveText("1 peça encontrada");
  await sizes.locator("h3 button").click();
  await expect(sizes.locator("h3 button")).toHaveAttribute("aria-expanded", "false");
  await page.getByRole("button", { name: "Limpar filtros", exact: true }).click();
  await expect(count).toHaveText("4 peças encontradas");
  await expect(page.getByRole("button", { name: "Limpar filtros", exact: true })).toHaveCount(0);
  await sizes.locator("h3 button").click();
  await sizes.getByRole("button", { name: "39", exact: true }).click();
  await expect(count).toHaveText("1 peça encontrada");
  await expect(page.locator("main").getByText("Calçado API", { exact: true })).toBeVisible();
});

test("mobile filters support arbitrary sizes without overflowing", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("group", { name: "Filtrar por tamanho" }).getByRole("button", { name: "Único", exact: true }).click();
  await expect(page.getByText("1 peça encontrada", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Limpar filtros", exact: true }).click();
  await expect(page.getByText("4 peças encontradas", { exact: true })).toBeVisible();
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

// Espera inicial (servidor gratuito acordando): nada até 1,5s, depois o LatticeLoader; o catálogo tenta de novo
// sozinho por 60s e só então mostra o erro com "Tentar novamente", que funciona.
const loader = (page: Page) => page.locator("[data-store-loading]");
test("catalog waits for the sleeping server, then offers a working retry and a separate empty state", async ({ page }) => {
  await page.clock.install();
  await page.route("**/api/produtos{,/admin,/carrossel}", route => route.fulfill({ status: 503, json: {} }));
  await page.goto("/");
  await expect(page.locator("header")).toBeVisible();
  await expect(loader(page)).toHaveCount(0);
  await page.clock.runFor(1600);
  await expect(loader(page)).toBeVisible();
  await expect(loader(page).getByRole("status")).toContainText("Preparando a loja");
  await expect(loader(page)).toContainText("O servidor gratuito pode levar até 1 minuto para acordar na primeira visita.");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.clock.fastForward(30000); // salto direto (runFor simularia cada tentativa e o cronômetro)
  await expect(page.getByRole("alert")).toHaveCount(0); // ainda tentando
  await page.clock.fastForward(32000);
  await expect(page.getByRole("alert").filter({ hasText: "A loja não respondeu a tempo" })).toBeVisible();
  await expect(loader(page)).toHaveCount(0);
  await page.route("**/api/produtos{,/admin,/carrossel}", route => route.fulfill({ json: [] }));
  await page.getByRole("button", { name: "Tentar novamente" }).click();
  await page.clock.runFor(500);
  await expect(page.getByText("Nenhuma peça encontrada", { exact: true })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("slow first load shows the lattice loader, which fades out without shifting the catalog", async ({ page }) => {
  await page.route("**/api/produtos{,/admin,/carrossel}", async route => {
    await new Promise(resolve => setTimeout(resolve, 3000));
    await route.fulfill({ json: products });
  });
  await page.goto("/");
  await expect(loader(page)).toBeVisible({ timeout: 2500 });
  await expect(loader(page).locator('[aria-label], .ll-run').first()).toBeAttached();
  const cell = loader(page).locator(".ll-run > span").first();
  expect(await cell.evaluate(el => getComputedStyle(el).backgroundColor)).toBe("rgb(244, 236, 3)"); // var(--primary)
  await expect(page.locator(".store-product-card").first()).toBeVisible({ timeout: 10000 });
  const top = await page.locator(".store-catalog-grid").evaluate(el => el.getBoundingClientRect().top);
  await expect(loader(page)).toHaveCount(0);
  expect(await page.locator(".store-catalog-grid").evaluate(el => el.getBoundingClientRect().top)).toBe(top);
});

test("fast first load never shows the loader", async ({ page }) => {
  await page.route("**/api/produtos{,/admin,/carrossel}", route => route.fulfill({ json: products }));
  await page.goto("/");
  await expect(page.locator(".store-product-card").first()).toBeVisible();
  await page.waitForTimeout(2000);
  await expect(loader(page)).toHaveCount(0);
});

test("reduced motion keeps the lattice cells still and only the timer runs", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.clock.install();
  await page.route("**/api/produtos{,/admin,/carrossel}", route => route.fulfill({ status: 503, json: {} }));
  await page.goto("/");
  await page.clock.runFor(1600);
  await expect(loader(page)).toBeVisible();
  expect(await loader(page).locator(".ll-run > span").evaluateAll(cells => cells.every(cell => getComputedStyle(cell).animationName === "none"))).toBe(true);
  const timer = loader(page).locator(".tabular-nums");
  const first = await timer.textContent();
  await page.clock.runFor(1000);
  await expect(timer).not.toHaveText(first!);
  await expect(timer).toHaveAttribute("aria-hidden", "true"); // o cronômetro não é anunciado
});

test("detail and persisted cart respect variant stock and decimal prices", async ({ page }) => {
  await page.goto("/?productId=901");
  const detail = page.locator(".store-product-detail-content");
  await expect(page.getByRole("heading", { name: "Camiseta API", exact: true })).toBeVisible();
  await expect(page.getByText("Descrição real do catálogo")).toBeVisible();
  await expect(detail.getByRole("button", { name: "M", exact: true })).toBeDisabled();
  await detail.getByRole("button", { name: "P", exact: true }).click();
  await detail.getByRole("button", { name: "Adicionar ao carrinho", exact: true }).click();
  await expect(detail.getByRole("button", { name: "P", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Abrir carrinho" }).click();
  await expect(page.getByRole("button", { name: "Aumentar quantidade" })).toBeDisabled();
  await expect(page.getByText(/R\$\s*129,90/).first()).toBeVisible();
  await page.evaluate(() => localStorage.setItem("brecho_guest_cart_v2", JSON.stringify([
    { product: { id: 901, price: 1 }, size: "P", quantity: 99 },
    { product: { id: 901 }, size: "M", quantity: 4 },
    { product: { id: 99999 }, size: "P", quantity: 4 }
  ])));
  await page.reload();
  await expect(page.getByRole("heading", { name: "Camiseta API", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Abrir carrinho" }).click();
  await expect(page.getByRole("button", { name: "Aumentar quantidade" })).toBeDisabled();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("brecho_guest_cart_v2")!));
  expect(saved).toHaveLength(1);
  expect(saved[0].quantity).toBe(1);
  expect(saved[0].product.price).toBe(129.9);
});

test("catalog loads real PostgreSQL products through the API proxy", async ({ page }) => {
  await page.unroute("**/api/produtos{,/admin,/carrossel}");
  const response = await page.request.get("/api/produtos");
  expect(response.ok()).toBeTruthy();
  const realProducts = await response.json();
  expect(realProducts.length).toBeGreaterThan(0);
  await page.goto("/");
  await expect(page.getByText(`${realProducts.length} peças encontradas`, { exact: true })).toBeVisible();
  await expect(page.locator("main").getByText(realProducts[0].name, { exact: true })).toBeVisible();
});

test("cards cap additions by stock and replace broken images without changing their layout", async ({ page }) => {
  await page.route("**/broken-product.jpg", route => route.fulfill({ status: 404, body: "missing" }));
  await page.route("**/api/produtos{,/admin,/carrossel}", route => route.fulfill({ json: [{ ...products[0], imageUrl: "/broken-product.jpg" }] }));
  await page.goto("/");
  const main = page.locator("main");
  const image = main.getByRole("img", { name: "Camiseta API", exact: true });
  await expect(image).toHaveAttribute("src", /^data:image\/svg\+xml/);
  await expect(image).toHaveClass(/object-cover/);
  await expect(main.getByRole("button", { name: "M", exact: true }).last()).toBeDisabled();
  await main.getByRole("button", { name: "P", exact: true }).last().click();
  await main.getByRole("button", { name: "Adicionar ao carrinho", exact: true }).click();
  await expect(main.getByRole("button", { name: /Adicionado|Limite de estoque/ })).toBeDisabled();
  await page.getByRole("button", { name: "Abrir carrinho" }).click();
  await expect(page.getByRole("button", { name: "Aumentar quantidade" })).toBeDisabled();
});

test("malformed catalog data is an API error instead of a fabricated catalog", async ({ page }) => {
  await page.clock.install();
  await page.route("**/api/produtos{,/admin,/carrossel}", route => route.fulfill({ json: [{ ...products[0], price: "invalid" }] }));
  await page.goto("/");
  await page.clock.fastForward(62000);
  await expect(page.getByRole("alert").filter({ hasText: "A loja não respondeu a tempo" })).toBeVisible();
  await expect(page.locator("main").getByText("Camiseta API", { exact: true })).toHaveCount(0);
});

test("audience includes unisex only for adults and clearing resets every existing catalog filter", async ({ page }) => {
  await page.route("**/api/produtos{,/admin,/carrossel}", route => route.fulfill({
    json: [...products,
    product(905, "Infantil API", "infantil", "camisetas", [{ value: "8", stock: 1 }])
    ]
  }));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const sections = page.locator("aside section");
  const [sizes, audience, category] = [sections.nth(0), sections.nth(1), sections.nth(2)];
  const clear = page.getByRole("button", { name: "Limpar filtros", exact: true });
  const count = page.getByText(/^[0-9]+ peças? encontrad[ao]s?$/);
  await expect(count).toHaveText("5 peças encontradas");
  await expect(clear).toHaveCount(0);
  for (const [label, total] of [["Masculino", 3], ["Feminino", 3], ["Unissex", 2], ["Infantil", 1]] as const) {
    await audience.getByRole("button", { name: label, exact: true }).click();
    await expect(clear).toBeVisible();
    await expect(count).toHaveText(`${total} ${total === 1 ? "peça encontrada" : "peças encontradas"}`);
    await clear.click();
    await expect(clear).toHaveCount(0);
    await expect(count).toHaveText("5 peças encontradas");
  }
  await category.getByRole("button", { name: "Camisetas / Camisas", exact: true }).click();
  await expect(clear).toBeVisible();
  await clear.click();
  await sizes.getByRole("button", { name: "Único", exact: true }).click();
  await expect(clear).toBeVisible();
  await category.getByRole("button", { name: "Camisetas / Camisas", exact: true }).click();
  await audience.getByRole("button", { name: "Feminino", exact: true }).click();
  await expect(count).toHaveText("1 peça encontrada");
  await expect(page.locator("main").getByText("Camiseta Livre", { exact: true })).toBeVisible();
  await clear.click();
  await expect(count).toHaveText("5 peças encontradas");
  await expect(clear).toHaveCount(0);
  await expect(sizes.getByRole("button", { name: "Único", exact: true })).toHaveAttribute("aria-pressed", "false");
  for (const section of [category, audience]) await expect(section.getByRole("button", { name: "Todos", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("size groups use only available variants, with a divider only between text and numbers", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const variants = ["10", "9", "8", "M", "P", "Único"].map(value => ({ value, stock: 2 }));
  await page.route("**/api/produtos{,/admin,/carrossel}", route => route.fulfill({ json: [product(910, "Tamanhos API", "unissex", "camisetas", [...variants, { value: "36", stock: 0 }])] }));
  await page.goto("/");
  const sizes = page.locator("aside section").first();
  await expect(sizes.locator("button[aria-pressed]")).toHaveText(["P", "M", "Único", "8", "9", "10"]);
  await expect(sizes.getByRole("separator")).toHaveCount(1);
  expect(await sizes.locator("hr").evaluate(element => [element.previousElementSibling?.textContent?.trim(), element.nextElementSibling?.textContent?.trim()])).toEqual(["Único", "8"]);
  await sizes.locator("h3 button").click();
  await expect(sizes.getByRole("separator")).toBeHidden();
  await sizes.locator("h3 button").click();
  await expect(sizes.getByRole("separator")).toBeVisible();
  for (const only of [[{ value: "Único", stock: 1 }], [{ value: "8", stock: 1 }]]) {
    await page.route("**/api/produtos{,/admin,/carrossel}", route => route.fulfill({ json: [product(911, "Grupo único", "unissex", "camisetas", only)] }));
    await page.reload();
    await expect(sizes.locator("button[aria-pressed]")).toHaveText([only[0].value]);
    await expect(sizes.getByRole("separator")).toHaveCount(0);
  }
});

const sortedFixture = [
  { ...product(911, "Zebra", "masculino", "camisetas", [{ value: "M", stock: 3 }]), price: "100" },
  { ...product(912, "álgebra", "feminino", "jaquetas", [{ value: "G", stock: 3 }]), price: "50" },
  { ...product(913, "Algebra", "unissex", "camisetas", [{ value: "M", stock: 3 }]), price: "500" },
  { ...product(914, "Bota", "masculino", "calcados", [{ value: "39", stock: 3 }]), price: "100" },
];

test("catalog sort toggles independently of filters, clear and initial order", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.route("**/api/produtos{,/admin,/carrossel}", route => route.fulfill({ json: sortedFixture }));
  await page.goto("/");
  const names = page.locator("main div.group p.line-clamp-2");
  const controls = page.getByRole("group", { name: "Ordenar produtos" });
  const name = controls.getByRole("button", { name: /Ordenar por nome/ });
  const price = controls.getByRole("button", { name: /Ordenar por preço/ });
  await expect(names).toHaveText(["Zebra", "álgebra", "Algebra", "Bota"]);
  await expect(name).toHaveAttribute("aria-pressed", "false");
  await expect(price).toHaveAttribute("aria-pressed", "false");
  await expect(controls.locator("svg.lucide-arrow-up-down")).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Limpar filtros", exact: true })).toHaveCount(0);
  await name.focus(); await page.keyboard.press("Enter");
  await expect(name.locator("svg.lucide-arrow-up")).toBeVisible();
  await expect(price.locator("svg.lucide-arrow-up-down")).toBeVisible();
  await expect(names).toHaveText(["álgebra", "Algebra", "Bota", "Zebra"]);
  await expect(name).toHaveAccessibleName("Ordenar por nome, crescente");
  await page.keyboard.press("Space");
  await expect(name.locator("svg.lucide-arrow-down")).toBeVisible();
  await expect(names).toHaveText(["Zebra", "Bota", "álgebra", "Algebra"]);
  await expect(name).toHaveAccessibleName("Ordenar por nome, decrescente");
  await price.click();
  await expect(name.locator("svg.lucide-arrow-up-down")).toBeVisible();
  await expect(price.locator("svg.lucide-arrow-up")).toBeVisible();
  await expect(name).toHaveAttribute("aria-pressed", "false");
  await expect(price).toHaveAccessibleName("Ordenar por preço, crescente");
  await expect(names).toHaveText(["álgebra", "Zebra", "Bota", "Algebra"]);
  await price.click();
  await expect(price.locator("svg.lucide-arrow-down")).toBeVisible();
  await expect(controls.locator('[aria-pressed="true"]')).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Limpar filtros", exact: true })).toHaveCount(0);
  await expect(names).toHaveText(["Algebra", "Zebra", "Bota", "álgebra"]);
  const aside = page.locator("aside");
  await aside.getByRole("button", { name: "Masculino", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Masculino", exact: true })).toBeVisible();
  await expect(names).toHaveText(["Algebra", "Zebra", "Bota"]);
  await aside.getByRole("button", { name: "Camisetas / Camisas", exact: true }).click();
  await aside.getByRole("button", { name: "M", exact: true }).click();
  await expect(names).toHaveText(["Algebra", "Zebra"]);
  await aside.getByRole("button", { name: "Feminino", exact: true }).click();
  await expect(names).toHaveText(["Algebra"]);
  await expect(price).toHaveAccessibleName("Ordenar por preço, decrescente");
  await page.getByRole("button", { name: "Limpar filtros", exact: true }).click();
  await expect(names).toHaveText(["Algebra", "Zebra", "Bota", "álgebra"]);
  await expect(price).toHaveAttribute("aria-pressed", "true");
  await name.click();
  await expect(name.locator("svg.lucide-arrow-up")).toBeVisible();
  await expect(price.locator("svg.lucide-arrow-up-down")).toBeVisible();
  await expect(name).toHaveAccessibleName("Ordenar por nome, crescente");
  await expect(price).toHaveAttribute("aria-pressed", "false");
  await page.reload();
  await expect(names).toHaveText(["Zebra", "álgebra", "Algebra", "Bota"]);
  await expect(name).toHaveAttribute("aria-pressed", "false");
});

for (const width of [1440, 390, 320]) test(`sorting header fits and remains stable at ${width}px`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 900 });
  await page.route("**/api/produtos{,/admin,/carrossel}", route => route.fulfill({ json: sortedFixture }));
  await page.goto("/");
  const heading = page.getByRole("heading", { name: "Todas as Peças", exact: true });
  const controls = page.getByRole("group", { name: "Ordenar produtos" });
  await controls.scrollIntoViewIfNeeded();
  // Com a fonte reserva o título cabe numa linha; com a Oswald quebra em duas e a ordenação desce. Mede depois.
  await expect(heading).toBeVisible(); await page.evaluate(() => document.fonts.ready);
  const before = await controls.boundingBox();
  const title = await heading.boundingBox();
  expect(before!.x).toBeGreaterThan(title!.x);
  if (width === 1440) expect(Math.abs(before!.y - title!.y)).toBeLessThan(20);
  else {
    // Celular: ordenação ao lado do título (o título quebra de linha se precisar), sem sobrepor e dentro da tela.
    expect(before!.x).toBeGreaterThanOrEqual(title!.x + title!.width - 0.5);
    expect(before!.x + before!.width).toBeLessThanOrEqual(width);
  }
  const name = controls.getByRole("button", { name: /Ordenar por nome/ });
  await name.hover();
  await name.click();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(name).toHaveCSS("outline-style", "solid");
  expect(await controls.boundingBox()).toEqual(before);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath(`sort-${width}.png`), animations: "disabled" });
  await name.click();
  await expect(name).toHaveAccessibleName("Ordenar por nome, decrescente");
  expect(await controls.boundingBox()).toEqual(before);
});

for (const width of [1440, 768, 390, 320]) test(`clear filters sits below the header row without overflow at ${width}px`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 900 });
  await page.goto("/");
  const sizes = width === 1440 ? page.locator("aside").locator("section").first() : page.getByRole("group", { name: "Filtrar por tamanho" });
  await sizes.getByRole("button", { name: "P", exact: true }).click();
  const clear = page.getByRole("button", { name: "Limpar filtros", exact: true });
  const controls = page.getByRole("group", { name: "Ordenar produtos" });
  const name = controls.getByRole("button", { name: /Ordenar por nome/ });
  const price = controls.getByRole("button", { name: /Ordenar por preço/ });
  await clear.scrollIntoViewIfNeeded();
  // Screenshots wait for fonts; take the baseline after the same font load.
  await page.evaluate(() => document.fonts.ready);
  const bounds = await Promise.all([clear, name, price].map(control => control.boundingBox()));
  const section = page.locator("main section").filter({ has: controls });
  const header = section.locator(":scope > div").first();
  const grid = section.locator(".store-catalog-grid");
  const layoutBounds = await Promise.all([header, grid].map(item => item.boundingBox()));
  expect(layoutBounds.every(Boolean)).toBe(true);
  for (const box of bounds) {
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
  }
  expect(bounds[0]!.y).toBeGreaterThanOrEqual(Math.max(bounds[1]!.y + bounds[1]!.height, bounds[2]!.y + bounds[2]!.height) - 1);
  if (width === 1440) {
    expect(bounds[0]!.y).toBeGreaterThan(bounds[1]!.y);
  }
  await page.screenshot({ path: testInfo.outputPath(`inactive-${width}.png`), animations: "disabled" });
  for (const [index, control] of [name, name, price, price, name].entries()) {
    await control.click();
    expect(await Promise.all([clear, name, price].map(item => item.boundingBox()))).toEqual(bounds);
    expect(await Promise.all([header, grid].map(item => item.boundingBox()))).toEqual(layoutBounds);
    await expect(controls.locator('[aria-pressed="true"]')).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (index === 3) await page.screenshot({ path: testInfo.outputPath(`active-${width}.png`), animations: "disabled" });
  }
  await clear.click();
  await expect(clear).toHaveCount(0);
  await expect(name).toHaveAccessibleName("Ordenar por nome, crescente");
});

for (const width of [1440, 390]) {
  test(`piece types remain global across size, audience, category and color selections at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const pants = product(920, "Calça multicor", "feminino", "calcas", [{ value: "P", stock: 0 }]);
    pants.colors.push({ ...pants.colors[0], id: 9201, colorName: "Branco", colorValue: "#FFFFFF", variants: [{ id: 9202, value: "GG", stock: 2 }] });
    // Products absent from the public API cannot create filter options. This
    // public is the audience, while isPublished controls publication.
    await page.route("**/api/produtos{,/admin,/carrossel}", route => route.fulfill({
      json: [
        pants, products[0],
        product(921, "Jaqueta esgotada", "unissex", "jaquetas", [{ value: "M", stock: 0 }]),
        product(922, "Calçado sem variantes", "infantil", "calcados", [])
      ]
    }));
    await page.goto("/");
    const mobile = width < 1024;
    const menu = page.getByRole("button", { name: "Abrir menu de navegação" });
    const options = mobile
      ? page.locator("header").getByRole("button", { name: "Camisetas / Camisas", exact: true }).locator("..")
      : page.locator("aside section").nth(2).locator("div").first();
    const labels = ["Todos", "Calças", "Camisetas / Camisas"];
    const checkOptions = async () => {
      if (mobile) await menu.click();
      await expect(options.getByRole("button")).toHaveText(labels);
    };
    await checkOptions();
    if (mobile) await menu.click();
    const pantsCard = page.locator("main div.group").filter({ has: page.getByText("Calça multicor", { exact: true }) });
    await pantsCard.getByRole("button", { name: "Branco", exact: true }).click();
    await checkOptions();
    await options.getByRole("button", { name: "Calças", exact: true }).click();
    await expect(page.getByText("1 peça encontrada", { exact: true })).toBeVisible();
    const sizes = mobile ? page.getByRole("group", { name: "Filtrar por tamanho" }) : page.locator("aside section").first();
    await sizes.getByRole("button", { name: "P", exact: true }).click();
    await expect(page.getByText("Nenhuma peça encontrada", { exact: true })).toBeVisible();
    await checkOptions();
    if (mobile) await menu.click();
    await page.getByRole("button", { name: "Limpar filtros", exact: true }).first().click();
    await expect(page.getByText("4 peças encontradas", { exact: true })).toBeVisible();
    await checkOptions();
    await expect(options.getByRole("button", { name: "Todos", exact: true })).toHaveAttribute("aria-pressed", "true");
    if (!mobile) {
      const audience = page.locator("aside section").nth(1);
      await audience.getByRole("button", { name: "Masculino", exact: true }).click();
      await expect(page.getByText("2 peças encontradas", { exact: true })).toBeVisible();
      await checkOptions();
      await audience.getByRole("button", { name: "Infantil", exact: true }).click();
      await sizes.getByRole("button", { name: "GG", exact: true }).click();
      await expect(page.getByText("Nenhuma peça encontrada", { exact: true })).toBeVisible();
      await checkOptions();
    } else {
      await expect(page.locator("header").getByRole("button", { name: "Público", exact: true })).toHaveCount(0);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (!mobile) {
      await page.getByRole("button", { name: "Limpar filtros", exact: true }).first().click();
      await expect(page.getByText("4 peças encontradas", { exact: true })).toBeVisible();
    }
  });
}

for (const change of ["removed", "sold out"] as const) {
  test(`catalog refresh clears a selected type when its last available product is ${change}`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    let catalog = [products[0], products[1]];
    await page.route("**/api/produtos{,/admin,/carrossel}", route => route.fulfill({ json: catalog }));
    // Exercise the existing onChanged -> useProducts retry flow without DB mutations.
    await page.route("**/api/produtos/902", async route => {
      if (route.request().method() === "DELETE") {
        catalog = [products[0]];
        await route.fulfill({ status: 204 });
      } else if (route.request().method() === "PUT") {
        const updated = { ...products[1], colors: products[1].colors.map(c => ({ ...c, variants: c.variants.map(v => ({ ...v, stock: 0 })) })) };
        catalog = [products[0], updated];
        await route.fulfill({ json: updated });
      } else await route.abort();
    });
    await page.goto("/");
    await page.getByRole("button", { name: "Entrar", exact: true }).first().click();
    await page.getByLabel("E-mail", { exact: true }).fill(process.env.E2E_ADMIN_EMAIL!);
    await page.getByLabel("Senha", { exact: true }).fill(process.env.E2E_ADMIN_PASSWORD!);
    await page.locator('form button[type="submit"]').click();
    await page.getByRole("link", { name: "Ver loja", exact: true }).click();
    const category = page.locator("aside section").nth(2);
    await category.getByRole("button", { name: "Jaquetas / Agasalhos", exact: true }).click();
    await expect(page.getByText("1 peça encontrada", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: process.env.E2E_ADMIN_EMAIL!.split("@")[0], exact: true }).click();
    await page.getByRole("link", { name: "Painel Administrativo", exact: true }).click();
    await page.getByRole("link", { name: "Produtos", exact: true }).click();
    const row = page.getByRole("article", { name: "Jaqueta API", exact: true });
    if (change === "removed") {
      await row.getByRole("button", { name: "Excluir", exact: true }).click();
      await page.getByRole("button", { name: "Confirmar exclusão", exact: true }).click();
      await expect(page.getByRole("alertdialog")).toHaveCount(0);
    } else {
      await row.getByRole("link", { name: "Editar", exact: true }).click();
      await page.getByLabel("Estoque 1", { exact: true }).fill("0");
      await page.getByLabel("Estoque 2", { exact: true }).fill("0");
      await page.getByRole("button", { name: "Salvar produto", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Produtos", exact: true })).toBeVisible();
    }
    await page.getByRole("link", { name: "Ver loja", exact: true }).click();
    // Sobrou uma categoria: o filtro some (menos de 2 opções), com a seleção já limpa ("Todos").
    await expect(category.locator("button[aria-pressed]")).toHaveText(["Todos", "Camisetas / Camisas"]);
    await expect(category).toBeHidden();
    await expect(category.getByRole("button", { name: "Todos", exact: true, includeHidden: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: "Limpar filtros", exact: true })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Todas as Peças", exact: true })).toBeVisible();
    await expect(page.locator("main").getByText("Camiseta API", { exact: true })).toBeVisible();
  });
}
