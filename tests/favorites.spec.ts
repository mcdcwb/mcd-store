import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

for (const touch of [false, true]) for (const width of [320, 390, 768, 1440]) {
  test.describe(`bookmark ${touch ? "touch" : "desktop"} ${width}`, () => {
    test.use({ viewport: { width, height: 1000 }, hasTouch: touch, isMobile: touch });
    test("whole-card reveal, keyboard access and anchored icon-only scale", async ({ page }) => {
      await page.route("**/api/produtos", route => route.fulfill({ json: [{ id: 990, name: "Bookmark interaction", price: 30, public: "unissex", category: "camisetas", colors: [{ id: 990, colorName: "Preto", colorValue: "#111111", images: [], variants: [{ id: 990, value: "P", stock: 3 }] }] }] }));
      await page.goto("/");
      const card = page.locator(".store-product-card");
      const favorite = card.getByRole("button", { name: "Favoritar", exact: true });
      const svg = favorite.locator("svg");
      await card.scrollIntoViewIfNeeded(); await page.mouse.move(0, 0);
      await expect(favorite).toHaveCSS("opacity", touch ? "1" : "0");
      await expect(favorite).toHaveCSS("pointer-events", touch ? "auto" : "none");
      const edge = () => favorite.evaluate(button => {
        const outer = button.closest(".store-product-card")!.getBoundingClientRect();
        const path = button.querySelector<SVGPathElement>("path")!;
        const b = path.getBBox();
        const p = new DOMPoint(b.x + b.width + 0.48, b.y - 0.48).matrixTransform(path.getScreenCTM()!);
        const hit = button.getBoundingClientRect();
        return { top: p.y - outer.top, right: outer.right - p.x, width: hit.width, height: hit.height };
      });
      if (!touch) {
        for (const target of [card.getByRole("img"), card.getByText("Bookmark interaction", { exact: true }), card.getByText("R$ 30,00", { exact: true }), card.getByRole("button", { name: "Preto", exact: true }), card.getByRole("button", { name: "P", exact: true }), card.getByRole("button", { name: /Selecione o tamanho|Adicionar ao carrinho/ })]) {
          await target.hover(); await expect(favorite).toHaveCSS("opacity", "1");
          await expect(svg).toHaveCSS("transform", "none");
        }
        const before = await edge();
        await favorite.hover();
        const tooltip = page.locator(".store-favorite-tooltip");
        await expect(tooltip).toHaveText("Adicionar aos Favoritos");
        await expect(tooltip).toBeVisible();
        expect(await tooltip.evaluate(el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; })).toBe(true);
        await expect(svg).toHaveCSS("transform", "matrix(1.1, 0, 0, 1.1, 0, 0)");
        const after = await edge();
        expect(after.top).toBeCloseTo(before.top, 1);
        expect(after.right).toBeGreaterThan(0);
        expect(after.width).toBeCloseTo(44, 3); expect(after.height).toBeCloseTo(44, 3);
        await page.mouse.move(0, 0); await expect(favorite).toHaveCSS("opacity", "0");
      }
      await favorite.focus(); await page.keyboard.press("Tab"); await page.keyboard.press("Shift+Tab");
      await expect(favorite).toBeFocused(); await expect(favorite).toHaveCSS("opacity", "1");
      await expect(favorite).toHaveCSS("outline-style", "solid");
      await expect(page.locator(".store-favorite-tooltip")).toBeVisible();
      await expect(favorite).toHaveAttribute("aria-describedby", await page.locator(".store-favorite-tooltip").getAttribute("id"));
      await page.emulateMedia({ reducedMotion: "reduce" });
      await card.getByText("Bookmark interaction", { exact: true }).hover();
      await favorite.hover();
      await expect(favorite).toHaveCSS("transition-duration", "0s");
      await expect(svg).toHaveCSS("transition-duration", "0s");
      await expect(svg).toHaveCSS("transform", "none");
      await favorite.press("Enter");
      await expect(page.getByRole("heading", { name: "Entrar", exact: true })).toBeVisible();
      await expect(page.locator('[data-sonner-toast][data-type="success"]')).toHaveCount(0);
    });
  });
}


for (const touch of [false, true]) for (const width of [320, 390, 768, 1440]) {
  test.describe(`arrows ${touch ? "touch" : "desktop"} ${width}`, () => {
    test.use({ viewport: { width, height: 1000 }, hasTouch: touch, isMobile: touch });
    test("whole-card arrow reveal, soft background, keyboard and navigation", async ({ page }, info) => {
      const product = { id: 991, name: 'Arrow interaction', price: 30, public: 'unissex', category: 'camisetas', colors: [{ id: 991, colorName: 'Preto', colorValue: '#111111', images: ['/arrow-light.svg', '/arrow-dark.svg'], variants: [{ id: 991, value: 'P', stock: 3 }] }] };
      await page.route('**/api/produtos', route => route.fulfill({ json: [product, { ...product, id: 992, name: 'Single image', colors: [{ ...product.colors[0], images: ['/arrow-light.svg'] }] }] }));
      await page.route('**/arrow-*.svg', route => route.fulfill({ contentType: 'image/svg+xml', body: `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500"><rect width="400" height="500" fill="${route.request().url().includes('light') ? '#eeeeee' : '#111111'}"/></svg>` }));
      await page.goto('/');
      const card = page.locator('.store-product-card').first();
      const arrows = card.locator('.store-product-arrow');
      await card.evaluate(el => window.scrollTo(0, window.scrollY + el.getBoundingClientRect().top - 120));
      await page.mouse.move(0, 0);
      await expect(arrows).toHaveCount(2);
      await expect(page.locator('.store-product-card').nth(1).locator('.store-product-arrow')).toHaveCount(0);
      await expect(arrows.first()).toHaveCSS('opacity', touch ? '1' : '0');
      await expect(arrows.first()).toHaveCSS('pointer-events', touch ? 'auto' : 'none');
      if (!touch) {
        for (const target of [card.getByRole('img'), card.getByText('Arrow interaction', { exact: true }), card.getByText('R$ 30,00', { exact: true }), card.getByRole('button', { name: 'Preto', exact: true }), card.getByRole('button', { name: 'P', exact: true }), card.getByRole('button', { name: /Selecione o tamanho/ })]) {
          await target.hover(); await expect(arrows.first()).toHaveCSS('opacity', '1');
        }
      }
      await expect(arrows.first().locator('span')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0.35)');
      await expect(arrows.first()).toHaveCSS('width', '44px');
      await expect(arrows.first()).toHaveCSS('height', '44px');
      await card.evaluate(el => window.scrollTo(0, window.scrollY + el.getBoundingClientRect().top - 120));
      await card.getByRole('img').hover();
      await card.getByRole('button', { name: 'Próxima imagem', exact: true }).click();
      await expect(card.getByRole('img')).toHaveAttribute('src', '/arrow-dark.svg');
      await card.screenshot({ path: info.outputPath('dark-controls.png') });
      await page.mouse.move(0, 0);
      await arrows.first().focus(); await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab');
      await expect(arrows.first()).toHaveCSS('opacity', '1');
      await expect(arrows.first()).toHaveCSS('outline-style', 'solid');
      await page.keyboard.press('Enter');
      await expect(card.getByRole('img')).toHaveAttribute('src', '/arrow-light.svg');
      await card.screenshot({ path: info.outputPath('light-controls.png') });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await expect(arrows.first()).toHaveCSS('transition-duration', '0s');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
  });
}

test.describe("card favorite with size", () => {
  let product: { id: number; colors: { id: number }[] } | undefined;
  let adminToken = "";
  const name = "Favorito Card Tamanho";
  test.beforeAll(async ({ request }) => {
    adminToken = (await (await request.post("/api/auth/login", { data: { email: process.env.E2E_ADMIN_EMAIL, password: process.env.E2E_ADMIN_PASSWORD } })).json()).accessToken;
    const headers = { Authorization: `Bearer ${adminToken}` };
    const categoryId = (await (await request.get("/api/categorias", { headers })).json()).find((c: { name: string }) => c.name === "camisetas").id;
    const created = await request.post("/api/produtos", { headers, data: { name, price: 32, public: "unissex", categoryId,
      colors: [{ colorName: "Preto", colorValue: "#111111", images: [], variants: [{ value: "P", stock: 3 }, { value: "M", stock: 2 }, { value: "G", stock: 2 }] }] } });
    expect(created.status()).toBe(201);
    product = await created.json();
  });
  test.afterAll(async ({ request }) => {
    if (product) await request.delete(`/api/produtos/${product.id}`, { headers: { Authorization: `Bearer ${adminToken}` } });
  });

  async function loginAsCustomer(page: Page, request: APIRequestContext) {
    const token = (await (await request.post("/api/auth/login", { data: { email: process.env.E2E_USER_EMAIL, password: process.env.E2E_USER_PASSWORD } })).json()).accessToken as string;
    await request.delete(`/api/favoritos/${product!.id}`, { headers: { Authorization: `Bearer ${token}` } });
    await page.goto("/");
    await page.getByRole("button", { name: "Entrar", exact: true }).first().click();
    await page.getByLabel("E-mail", { exact: true }).fill(process.env.E2E_USER_EMAIL!);
    await page.getByLabel("Senha", { exact: true }).fill(process.env.E2E_USER_PASSWORD!);
    await page.locator('form button[type="submit"]').click();
    await expect(page.getByRole("button", { name: "Cliente", exact: true })).toBeVisible();
    await expect(page.getByText("Sincronizando favoritos e carrinho...")).toHaveCount(0);
    return token;
  }
  const productCard = (page: Page) => page.locator("main div.group").filter({ has: page.getByText(name, { exact: true }) });

  test("favoriting from the card keeps the selected size and shows add to cart in Favoritos", async ({ page, request }) => {
    const token = await loginAsCustomer(page, request);
    const card = productCard(page);
    await card.getByRole("button", { name: "M", exact: true }).click();
    await expect(card.getByRole("button", { name: "M", exact: true })).toHaveAttribute("aria-pressed", "true");
    await card.getByRole("button", { name: "Favoritar", exact: true }).press("Enter");
    await expect(card.getByRole("button", { name: "Remover dos favoritos" })).toHaveAttribute("aria-pressed", "true");
    // O favorito é da combinação cor + tamanho: trocar o tamanho no card mostra outro estado.
    await card.getByRole("button", { name: "P", exact: true }).click();
    await expect(card.getByRole("button", { name: "Favoritar", exact: true })).toHaveAttribute("aria-pressed", "false");

    const saved = await (await request.get("/api/favoritos", { headers: { Authorization: `Bearer ${token}` } })).json();
    expect(JSON.stringify(saved)).toContain('"size":"M"');

    await page.goto("/favoritos");
    const favorite = page.locator("main div.group").filter({ has: page.getByText(name, { exact: true }) });
    await expect(favorite.getByText("Cor: Preto · Tamanho: M")).toBeVisible();
    await expect(favorite.getByRole("button", { name: "Adicionar ao carrinho", exact: true })).toBeEnabled();
    await expect(favorite.getByRole("button", { name: "Escolher tamanho" })).toHaveCount(0);
    await request.delete(`/api/favoritos/${product!.id}`, { headers: { Authorization: `Bearer ${token}` } });
  });

  test("favorited G, reloaded: the card without a size stays filled, lists the sizes and removes all with one toast", async ({ page, request }) => {
    const token = await loginAsCustomer(page, request);
    const headers = { Authorization: `Bearer ${token}` };
    let card = productCard(page);
    await card.getByRole("button", { name: "G", exact: true }).click();
    await card.getByRole("button", { name: "Favoritar", exact: true }).press("Enter");
    await expect(card.getByRole("button", { name: "Remover dos favoritos" })).toHaveAttribute("aria-pressed", "true");

    // Recarregou: o card volta sem tamanho, mas o marcador continua preenchido e diz qual tamanho está salvo.
    await page.reload();
    await expect(page.getByText("Sincronizando favoritos e carrinho...")).toHaveCount(0);
    card = productCard(page);
    for (const size of ["P", "M", "G"]) await expect(card.getByRole("button", { name: size, exact: true })).toHaveAttribute("aria-pressed", "false");
    const saved = card.getByRole("button", { name: "Nos favoritos (G)", exact: true });
    await expect(saved).toHaveAttribute("aria-pressed", "true");
    await expect(saved.locator('[role="tooltip"]')).toHaveText("Nos favoritos (G)");
    await expect(card.locator("[data-bookmark-shape]")).toHaveAttribute("fill", "#c61010");

    // Mais um tamanho salvo: os dois aparecem na ordem da grade.
    await card.getByRole("button", { name: "M", exact: true }).click();
    await card.getByRole("button", { name: "Favoritar", exact: true }).press("Enter");
    await expect(card.getByRole("button", { name: "Remover dos favoritos" })).toHaveAttribute("aria-pressed", "true");
    await page.reload();
    await expect(page.getByText("Sincronizando favoritos e carrinho...")).toHaveCount(0);
    card = productCard(page);
    const both = card.getByRole("button", { name: "Nos favoritos (M, G)", exact: true });
    await expect(both).toHaveAttribute("aria-pressed", "true");

    // Sem tamanho escolhido, clicar remove todos os favoritos da cor, com um único toast, e não cria um favorito sem tamanho.
    await both.press("Enter");
    await expect(card.getByRole("button", { name: "Favoritar", exact: true })).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator("[data-store-toast]").filter({ hasText: "Produto removido dos favoritos!" })).toHaveCount(1);
    await expect(page.locator("[data-store-toast]")).toHaveCount(1);
    const remaining = await (await request.get("/api/favoritos", { headers })).json() as { product: { id: number } }[];
    expect(remaining.filter(f => f.product.id === product!.id)).toEqual([]);
    for (const size of ["M", "G"]) {
      await card.getByRole("button", { name: size, exact: true }).click();
      await expect(card.getByRole("button", { name: "Favoritar", exact: true })).toHaveAttribute("aria-pressed", "false");
    }
  });
});
