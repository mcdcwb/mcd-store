import { test, expect } from "@playwright/test";
import { expectSuccess, successToasts } from "./toast-helpers";

const fixture = (id: number, inCarousel = true) => ({
  id, name: `Carousel ${id}`, price: 30, public: id % 2 ? "masculino" : "feminino", category: "camisetas", inCarousel,
  colors: [{ id, colorName: "Preto", colorValue: "#111111", images: [`/carousel-${id % 2 ? "portrait" : "landscape"}.svg`], variants: [{ id, value: "M", stock: 4 }] }]
});

test("single unpublished carousel slide has no navigation or purchase controls", async ({ page }) => {
  await page.route("**/api/produtos", route => route.fulfill({ json: [] }));
  await page.route("**/api/produtos/carrossel", route => route.fulfill({ json: [{ ...fixture(2), isPublished: false }] }));
  await page.goto("/");
  const slider = page.getByRole("region", { name: "Carrossel de produtos" });
  await expect(slider.getByRole("heading")).toHaveText("Carousel 2");
  await expect(slider.getByRole("button", { name: /Produto anterior|Próximo produto|VER MAIS/, includeHidden: true })).toHaveCount(0);
  await expect(slider.locator("a")).toHaveCount(0);
  await expect(slider.locator(".store-carousel-image")).toBeVisible();
});

for (const width of [390, 1440]) test(`unpublished selected slides stay exclusive to the carousel at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  const published = { ...fixture(1), isPublished: true, category: { id: 1, name: "Camisetas" } };
  const draft = {
    ...fixture(2), name: "Lançamento roxo", isPublished: false, price: "9999.00", category: { id: 2, name: "Jaquetas" },
    colors: [{ id: 102, colorName: "Roxo", colorValue: "#800080", images: [], variants: [{ id: 202, value: "XGG", stock: 1 }] }]
  };
  const unselected = { ...draft, id: 3, name: "Rascunho fora dos slides", inCarousel: false };
  // Deliberately include drafts in the catalog mock to exercise its defensive filter too.
  await page.route("**/api/produtos", route => route.fulfill({ json: [published, draft, unselected] }));
  await page.route("**/api/produtos/carrossel", route => route.fulfill({ json: [published, draft] }));
  await page.addInitScript(draft => localStorage.setItem("brecho_guest_cart_v2", JSON.stringify([{ product: draft, colorId: 102, size: "XGG", quantity: 1 }])), draft);
  await page.goto("/");
  const slider = page.getByRole("region", { name: "Carrossel de produtos" });
  await expect(slider.locator("article")).toHaveCount(2);
  await expect(page.locator(".store-product-card")).toHaveCount(1);
  await expect(page.locator(".store-product-card")).toContainText("Carousel 1");
  await expect(page.getByText("1 peça encontrada", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "XGG", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Jaquetas", exact: true })).toHaveCount(0);
  await expect(page.getByText("Rascunho fora dos slides", { exact: true })).toHaveCount(0);
  await slider.hover();
  await expect(slider.getByRole("button", { name: "VER MAIS", exact: true })).toBeVisible();
  await slider.getByRole("button", { name: "Próximo produto", exact: true }).click();
  await expect(slider.getByRole("heading")).toHaveText("Lançamento roxo");
  await expect(slider.locator('article[aria-hidden="false"]').getByRole("button", { name: "VER MAIS", exact: true })).toHaveCount(0);
  await expect(slider.locator('article[aria-hidden="false"] a')).toHaveCount(0);
  await page.getByRole("button", { name: "Abrir carrinho", exact: true }).click();
  await expect(page.getByRole("button", { name: "Remover item", exact: true })).toHaveCount(0);
  await page.goto("/?productId=2&colorId=102");
  await expect(page.locator(".store-product-card")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Adicionar ao carrinho", exact: true })).toHaveCount(0);
  await page.goto("/");
  await slider.hover();
  await slider.getByRole("button", { name: "VER MAIS", exact: true }).click();
  await expect(page).toHaveURL(/productId=1/);
  await expect(page.getByRole("heading", { name: "Carousel 1", exact: true })).toBeVisible();
});

test("Manager explicitly selects a draft and publication toggles catalog access without losing its slide", async ({ page }) => {
  await page.goto("/manager");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.getByLabel("E-mail", { exact: true }).fill(process.env.E2E_ADMIN_EMAIL!);
  await page.getByLabel("Senha", { exact: true }).fill(process.env.E2E_ADMIN_PASSWORD!);
  await page.locator('form button[type="submit"]').click();
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
  const token = await page.evaluate(() => JSON.parse(localStorage.getItem("mcd-store_auth_v1")!).accessToken);
  const headers = { Authorization: `Bearer ${token}` };
  const selected = await (await page.request.get("/api/produtos/carrossel")).json();
  test.skip(selected.length >= 5, "Preserve existing slides when the carousel is full.");
  const categories = await (await page.request.get("/api/categorias", { headers })).json();
  const name = `Draft carousel E2E ${Date.now()}`;
  const response = await page.request.post("/api/produtos", {
    headers, data: {
      name, price: 9999, public: "unissex", categoryId: categories[0].id, isPublished: false,
      colors: [{ colorName: "Roxo", colorValue: "#800080", images: [], variants: [{ value: "XGG", stock: 1 }] }]
    }
  });
  expect(response.status()).toBe(201);
  const product = await response.json();
  try {
    await page.getByRole("link", { name: "Ver loja", exact: true }).click();
    await expect(page.getByText(name, { exact: true })).toHaveCount(0);
    await page.goto("/manager/produtos");
    await page.getByLabel("Buscar por nome").fill(name);
    await page.getByRole("article", { name, exact: true }).getByRole("button", { name: "Adicionar ao carrossel", exact: true }).click();
    await expectSuccess(page, "Produto adicionado ao carrossel!", "change");
    await page.getByRole("link", { name: "Ver loja", exact: true }).click();
    const slider = page.getByRole("region", { name: "Carrossel de produtos" });
    const slide = slider.locator("article").filter({ has: page.getByText(name, { exact: true }) });
    await expect(slide).toHaveCount(1);
    await expect(slide.getByRole("button", { name: "VER MAIS", includeHidden: true })).toHaveCount(0);
    await expect(page.locator(".store-product-card").filter({ has: page.getByText(name, { exact: true }) })).toHaveCount(0);
    for (const published of [true, false]) {
      await page.goto(`/manager/produtos/${product.id}/editar`);
      await page.getByRole("checkbox", { name: "Publicado na loja", exact: true }).setChecked(published);
      await page.getByRole("button", { name: "Salvar produto", exact: true }).click();
      await expectSuccess(page, "Produto salvo com sucesso!", "positive");
      await page.getByRole("link", { name: "Ver loja", exact: true }).click();
      await expect(slide).toHaveCount(1);
      await expect(slide.getByRole("button", { name: "VER MAIS", includeHidden: true })).toHaveCount(published ? 1 : 0);
      await expect(page.locator(".store-product-card").filter({ has: page.getByText(name, { exact: true }) })).toHaveCount(published ? 1 : 0);
    }
  } finally { await page.request.delete(`/api/produtos/${product.id}`, { headers }); }
});

for (const role of ["USER", "ADMIN"]) test(`unpublished and stale favorites cannot become purchasable cards for ${role}`, async ({ page }) => {
  const published = { ...fixture(1), isPublished: true };
  const draft = { ...fixture(2), isPublished: false };
  const stale = { ...fixture(3), isPublished: true }; // Formerly published; no longer in the catalog.
  const account = { id: 1, name: "Cliente de teste", email: "favorites@example.test", role };
  await page.addInitScript(() => localStorage.setItem("mcd-store_auth_v1", JSON.stringify({ accessToken: "favorites-test", expiresAt: Date.now() + 3600000 })));
  await page.route("**/api/auth/me", route => route.fulfill({ json: { account } }));
  await page.route("**/api/produtos", route => route.fulfill({ json: [published] }));
  await page.route("**/api/produtos/carrossel", route => route.fulfill({ json: [published, draft] }));
  await page.route("**/api/favoritos", route => route.fulfill({ json: [published, draft, stale].map(product => ({ product })) }));
  await page.route("**/api/carrinho", route => route.fulfill({ json: { items: [], notices: [] } }));
  await page.goto("/favoritos");
  await expect(page.getByRole("heading", { name: "Favoritos", exact: true })).toBeVisible();
  await expect(page.locator(".store-product-card")).toHaveCount(1);
  await expect(page.locator(".store-product-card")).toContainText("Carousel 1");
  await expect(page.getByText("Carousel 2", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Carousel 3", { exact: true })).toHaveCount(0);
});

for (const width of [320, 390, 768, 1440]) test(`active carousel image zooms and restarts at ${width}px`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 900 });
  await page.clock.install();
  await page.route("**/carousel-*.svg", route => route.fulfill({ contentType: "image/svg+xml", body: `<svg xmlns="http://www.w3.org/2000/svg" width="${route.request().url().includes("portrait") ? 400 : 1600}" height="${route.request().url().includes("portrait") ? 500 : 900}"><rect width="100%" height="100%" fill="#555"/><circle cx="50%" cy="50%" r="100" fill="#aaa"/></svg>` }));
  const products = [fixture(1), fixture(2)];
  products[0].colors[0].images.push("/carousel-landscape.svg");
  await page.route("**/api/produtos{,/admin,/carrossel}", route => route.fulfill({ json: products }));
  await page.goto("/");
  const slider = page.getByRole("region", { name: "Carrossel de produtos" });
  const activeImage = slider.locator('article[aria-hidden="false"] .store-carousel-image');
  const inactiveImage = slider.locator('article[aria-hidden="true"] .store-carousel-image');
  await expect(activeImage).toHaveAttribute("src", "/carousel-portrait.svg");
  await expect.poll(() => activeImage.evaluate(image => image.getAnimations().length)).toBe(1);
  expect(await activeImage.evaluate(image => image.getAnimations()[0].effect!.getTiming().duration)).toBe(5000);
  const initialTime = await activeImage.evaluate(image => Number(image.getAnimations()[0].currentTime));
  await expect.poll(() => activeImage.evaluate(image => Number(image.getAnimations()[0].currentTime))).toBeGreaterThan(initialTime);
  const background = slider.locator('article[aria-hidden="false"] img[aria-hidden="true"]');
  const backgroundTransform = await background.evaluate(image => getComputedStyle(image).transform);
  const frame = activeImage.locator("..");
  const originalBounds = await frame.boundingBox();
  for (const time of [0, 2500, 5000]) {
    await activeImage.evaluate((image, time) => { const animation = image.getAnimations()[0]; animation.pause(); animation.currentTime = time; }, time);
    await expect.poll(() => activeImage.evaluate(image => new DOMMatrixReadOnly(getComputedStyle(image).transform).a)).toBeCloseTo(1 + time / 5000 * 0.08, 3);
    await expect(background).toHaveCSS("transform", backgroundTransform);
    expect(await frame.boundingBox()).toEqual(originalBounds);
    if (time !== 2500) await slider.screenshot({ path: testInfo.outputPath(`zoom-${width}-${time}.png`) });
  }
  expect(await inactiveImage.evaluate(image => image.getAnimations().length)).toBe(0);
  await expect(inactiveImage).toHaveCSS("transform", "matrix(1, 0, 0, 1, 0, 0)");
  await slider.hover();
  await expect(activeImage).toHaveCSS("transform", "matrix(1.08, 0, 0, 1.08, 0, 0)");
  for (const name of ["Próximo produto", "Produto anterior"]) {
    await slider.getByRole("button", { name, exact: true }).click();
    await expect.poll(() => activeImage.evaluate(image => image.getAnimations().length)).toBe(1);
    expect(await activeImage.evaluate(image => Number(image.getAnimations()[0].currentTime))).toBeLessThan(1500);
    expect(await inactiveImage.evaluate(image => image.getAnimations().length)).toBe(0);
  }
  await page.mouse.move(0, 0);
  await page.clock.fastForward(5000);
  await expect(slider.getByRole("heading")).toHaveText("Carousel 2");
  expect(await activeImage.evaluate(image => Number(image.getAnimations()[0].currentTime))).toBeLessThan(1500);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("single slide keeps its final zoom and reduced motion preserves navigation", async ({ page }) => {
  let count = 1;
  await page.route("**/api/produtos{,/admin,/carrossel}", route => route.fulfill({ json: Array.from({ length: count }, (_, i) => fixture(i + 1)) }));
  await page.goto("/");
  const slider = page.getByRole("region", { name: "Carrossel de produtos" });
  const activeImage = slider.locator('article[aria-hidden="false"] .store-carousel-image');
  await expect.poll(() => activeImage.evaluate(image => image.getAnimations().length)).toBe(1);
  await activeImage.evaluate(image => image.getAnimations()[0].finish());
  await expect(activeImage).toHaveCSS("transform", "matrix(1.08, 0, 0, 1.08, 0, 0)");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(activeImage).toHaveCSS("transform", "matrix(1, 0, 0, 1, 0, 0)");
  expect(await activeImage.evaluate(image => image.getAnimations().length)).toBe(0);
  count = 2;
  await page.clock.install();
  await page.reload();
  await slider.hover();
  await slider.getByRole("button", { name: "Próximo produto", exact: true }).click();
  await expect(slider.getByRole("heading")).toHaveText("Carousel 2");
  await expect(activeImage).toHaveCSS("transform", "matrix(1, 0, 0, 1, 0, 0)");
  await page.mouse.move(0, 0);
  await page.clock.fastForward(5000);
  await expect(slider.getByRole("heading")).toHaveText("Carousel 1");
  expect(await activeImage.evaluate(image => image.getAnimations().length)).toBe(0);
});

for (const width of [1440, 768, 390, 320]) test(`slider renders exactly 0–5 selections and preserves images at ${width}px`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 900 });
  await page.route("**/carousel-*.svg", route => route.fulfill({ contentType: "image/svg+xml", body: `<svg xmlns="http://www.w3.org/2000/svg" width="${route.request().url().includes("portrait") ? 400 : 1600}" height="${route.request().url().includes("portrait") ? 500 : 900}"><rect width="100%" height="100%" fill="#555"/></svg>` }));
  let count = 0;
  await page.route("**/api/produtos{,/admin,/carrossel}", route => route.fulfill({ json: Array.from({ length: 6 }, (_, i) => fixture(i + 1, i < count)).reverse() }));
  for (count = 0; count <= 5; count++) {
    await page.goto("/");
    await expect(page.locator("main div.group").filter({ has: page.getByText("Carousel 6", { exact: true }) })).toBeVisible();
    const slider = page.getByRole("region", { name: "Carrossel de produtos" });
    await expect(slider).toHaveCount(count ? 1 : 0);
    if (count) {
      await expect(slider.locator("article")).toHaveCount(count);
      await expect(slider.getByRole("button", { name: /Ir para o produto/ })).toHaveCount(count);
      await expect(slider.getByRole("heading")).toHaveText("Carousel 1");
      const img = slider.getByRole("img", { name: "Carousel 1", exact: true });
      await expect(img).toHaveCSS("object-fit", "contain");
      await expect(img).toHaveCSS("height", width >= 640 ? "420px" : "288px");
      await expect(slider.locator('img[aria-hidden="true"]').first()).toHaveCSS("filter", /blur/);
      await slider.hover();
      await slider.getByRole("button", { name: `Ir para o produto ${count}`, exact: true }).click();
      await expect(slider.getByRole("heading")).toHaveText(`Carousel ${count}`);
      await expect.poll(async () => Math.round((await slider.locator('article[aria-hidden="false"]').boundingBox())!.x)).toBe(0);
      const currentImage = slider.getByRole("img", { name: `Carousel ${count}`, exact: true });
      await expect(currentImage).toHaveCSS("object-fit", "contain");
      await expect.poll(() => currentImage.evaluate(image => (image as HTMLImageElement).naturalWidth / (image as HTMLImageElement).naturalHeight)).toBe(count % 2 ? 4 / 5 : 16 / 9);
      if (count === 2) await page.screenshot({ path: testInfo.outputPath(`carousel-${width}.png`) });
      await expect(slider.getByRole("button", { name: "Próximo produto", exact: true })).toHaveCount(count > 1 ? 1 : 0);
      await expect(slider.getByRole("button", { name: "Produto anterior", exact: true })).toHaveCount(count > 1 ? 1 : 0);
      if (count > 1) {
        await slider.getByRole("button", { name: "Próximo produto", exact: true }).click();
        await expect(slider.getByRole("heading")).toHaveText("Carousel 1");
        await slider.getByRole("button", { name: "Produto anterior", exact: true }).click();
        await expect(slider.getByRole("heading")).toHaveText(`Carousel ${count}`);
      }
      await slider.getByRole("button", { name: "VER MAIS", exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`productId=${count}`));
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test("autoplay pauses on hover and shrinking selection clamps the current index", async ({ page }) => {
  await page.route("**/api/categorias", route => route.fulfill({ json: [{ id: 1, name: "camisetas" }] }));
  await page.route("**/api/settings", route => route.fulfill({ json: { lowStockThreshold: 5, showLowStockBadge: true, showLastUnitBadge: true } }));
  const account = { id: 1, name: "Administrador de teste", email: "admin@example.test", role: "ADMIN" };
  await page.route("**/api/auth/me", route => route.fulfill({ json: { account } }));
  await page.route("**/api/auth/login", route => route.fulfill({ json: { account, accessToken: "test-session", tokenType: "Bearer", expiresIn: 3600, expiresAt: Date.now() + 3600000 } }));
  await page.route("**/api/orders/status-counts", route => route.fulfill({ json: { PENDING_CONFIRMATION: 0, PREPARING: 0, READY_OR_SHIPPED: 0, COMPLETED: 0, CANCELLED: 0 } }));
  await page.route("**/api/orders/reports", route => route.fulfill({ json: { revenue: "0.00", completedOrders: 0, averageTicket: "0.00" } }));
  await page.route("**/api/orders?*", route => route.fulfill({ json: { items: [], total: 0, page: 1, pageSize: 20, totalPages: 1 } }));
  await page.clock.install();
  let count = 2;
  await page.route("**/api/produtos{,/admin,/carrossel}", route => route.fulfill({ json: Array.from({ length: count }, (_, i) => fixture(i + 1)) }));
  await page.goto("/");
  const slider = page.getByRole("region", { name: "Carrossel de produtos" });
  await expect(slider.getByRole("heading")).toHaveText("Carousel 1");
  await page.mouse.move(0, 0);
  await page.clock.fastForward(5000);
  await expect(slider.getByRole("heading")).toHaveText("Carousel 2");
  await slider.hover(); await page.clock.fastForward(10000);
  await expect(slider.getByRole("heading")).toHaveText("Carousel 2");
  await slider.getByRole("button", { name: "Ir para o produto 2", exact: true }).click();
  await expect(slider.getByRole("heading")).toHaveText("Carousel 2");
  // Trigger the existing catalog refresh by a confirmed Manager mutation.
  await page.evaluate(() => { history.pushState({}, "", "/manager"); window.dispatchEvent(new PopStateEvent("popstate")); });
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.getByLabel("E-mail", { exact: true }).fill(process.env.E2E_ADMIN_EMAIL!);
  await page.getByLabel("Senha", { exact: true }).fill(process.env.E2E_ADMIN_PASSWORD!);
  await page.locator('form button[type="submit"]').click();
  await page.getByRole("link", { name: "Produtos", exact: true }).click();
  await page.route("**/api/produtos/2/carrossel", route => { count = 1; return route.fulfill({ json: fixture(2, false) }); });
  await page.getByRole("article", { name: "Carousel 2", exact: true }).getByRole("button", { name: "Remover do carrossel" }).click();
  await expectSuccess(page, "Produto removido do carrossel!", "removal");
  await page.getByRole("link", { name: "Ver loja", exact: true }).click();
  await expect(slider.locator("article")).toHaveCount(1);
  await expect(slider.getByRole("heading")).toHaveText("Carousel 1");
  await expect(slider.getByRole("button", { name: /Produto anterior|Próximo produto/ })).toHaveCount(0);
});

test("carousel notifications distinguish confirmed changes, removals and real errors", async ({ page }) => {
  const product = fixture(1, false);
  await page.route("**/api/produtos{,/admin,/carrossel}", route => route.fulfill({ json: [product] }));
  let fail = false;
  await page.route("**/api/produtos/1/carrossel", route => {
    if (fail) return route.fulfill({ status: 409, json: { error: "Limite de 5 produtos no carrossel." } });
    product.inCarousel = route.request().postDataJSON().inCarousel;
    return route.fulfill({ json: product });
  });
  await page.goto("/manager");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.getByLabel("E-mail", { exact: true }).fill(process.env.E2E_ADMIN_EMAIL!);
  await page.getByLabel("Senha", { exact: true }).fill(process.env.E2E_ADMIN_PASSWORD!);
  await page.locator('form button[type="submit"]').click();
  await page.getByRole("link", { name: "Produtos", exact: true }).click();
  await page.getByRole("button", { name: "Adicionar ao carrossel" }).click();
  await expectSuccess(page, "Produto adicionado ao carrossel!", "change");
  await page.getByRole("button", { name: "Remover do carrossel" }).click();
  await expectSuccess(page, "Produto removido do carrossel!", "removal");
  fail = true;
  await page.getByRole("button", { name: "Adicionar ao carrossel" }).click();
  const error = page.locator('[data-sonner-toast][data-type="error"]');
  await expect(error).toHaveCount(1);
  await expect(error).toContainText("Limite de 5 produtos no carrossel.");
  await expect(error).toHaveCSS("background-color", "rgb(255, 240, 239)");
  await expect(successToasts(page)).toHaveCount(0);
});

test("Manager persists carousel selection, combines filters, prioritizes stably and handles limits", async ({ page }) => {
  await page.goto("/manager");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.getByLabel("E-mail", { exact: true }).fill(process.env.E2E_ADMIN_EMAIL!);
  await page.getByLabel("Senha", { exact: true }).fill(process.env.E2E_ADMIN_PASSWORD!);
  await page.locator('form button[type="submit"]').click();
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
  const token = await page.evaluate(() => JSON.parse(localStorage.getItem("mcd-store_auth_v1")!).accessToken);
  const headers = { Authorization: `Bearer ${token}` };
  const catalogResponse = await page.request.get("/api/produtos");
  expect(catalogResponse.ok()).toBe(true);
  const catalog = await catalogResponse.json();
  test.skip(catalog.some((product: { inCarousel: boolean }) => product.inCarousel),
    "Este cenário de limite global exige carrossel inicialmente vazio; a seleção existente é preservada.");
  const ids: number[] = [];
  const prefix = `Carousel E2E ${Date.now()} `;
  try {
    for (let i = 0; i < 6; i++) {
      const data = fixture(i + 1); const { id, inCarousel, category, ...input } = data;
      const response = await page.request.post("/api/produtos", { headers, data: { ...input, categoryId: catalog.find((p: any) => p.category.name === category).categoryId, name: prefix + i, colors: input.colors.map(({ id, ...color }) => ({ ...color, variants: [{ value: "M", stock: 4 }] })) } });
      expect(response.status()).toBe(201); ids.push((await response.json()).id);
    }
    await page.getByRole("link", { name: "Produtos", exact: true }).click();
    await page.reload();
    await page.getByLabel("Buscar por nome").fill(prefix);
    const rows = page.getByRole("article");
    const original = await rows.locator("h2").allTextContents();
    const row = (i: number) => page.getByRole("article", { name: prefix + i, exact: true });
    const add = row(3).getByRole("button", { name: "Adicionar ao carrossel" });
    expect((await add.boundingBox())!.y).toBeLessThan((await row(3).getByRole("button", { name: "Excluir", exact: true }).boundingBox())!.y);
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route(`**/api/produtos/${ids[3]}/carrossel`, async route => { await gate; await route.continue(); });
    await add.click();
    await expect(add).toBeDisabled();
    await expect(add).toHaveAttribute("aria-pressed", "false");
    await expect(successToasts(page)).toHaveCount(0);
    release();
    await expectSuccess(page, "Produto adicionado ao carrossel!", "change");
    await expect(row(3).getByRole("button", { name: "Remover do carrossel" })).toHaveAttribute("aria-pressed", "true");
    await expect(rows.locator("h2")).toHaveText([prefix + 3, ...original.filter(name => name !== prefix + 3)]);
    for (const i of [1, 0, 2, 4]) { await row(i).getByRole("button", { name: "Adicionar ao carrossel" }).click(); await expectSuccess(page, "Produto adicionado ao carrossel!", "change"); }
    await expect(rows.locator("h2")).toHaveText([...original.filter(name => name !== prefix + 5), prefix + 5]);
    await expect(row(5).getByRole("button", { name: "Adicionar ao carrossel" })).toBeDisabled();
    await expect(row(5).locator('[title="Limite de 5 produtos no carrossel"]')).toBeVisible();
    expect((await page.request.patch(`/api/produtos/${ids[5]}/carrossel`, { headers, data: { inCarousel: true } })).status()).toBe(409);
    const orderSection = page.locator('section[aria-labelledby="carousel-order-title"]');
    await expect(orderSection.locator("li")).toHaveCount(5);
    const firstOrderItem = orderSection.locator("li").first();
    const firstName = (await firstOrderItem.locator("span").nth(2).textContent())!;
    const secondName = (await orderSection.locator("li").nth(1).locator("span").nth(2).textContent())!;
    await firstOrderItem.getByRole("button", { name: `Mover ${firstName} para baixo` }).click();
    await expect(orderSection.locator("li").first()).toContainText(secondName);
    await orderSection.getByRole("button", { name: "Salvar ordem" }).click();
    await expectSuccess(page, "Ordem do carrossel salva!", "positive");
    const savedSlideNames = await page.request.get("/api/produtos/carrossel").then(response => response.json()).then((items: any[]) => items.map(item => item.name));
    expect(savedSlideNames[0]).toBe(secondName);
    expect(savedSlideNames[1]).toBe(firstName);
    await page.reload();
    await page.getByLabel("Buscar por nome").fill(prefix);
    await expect(orderSection.locator("li").first()).toContainText(secondName);
    await page.getByLabel("Apenas itens do carrossel", { exact: true }).check(); await expect(rows).toHaveCount(5);
    await page.getByLabel("Público", { exact: true }).selectOption("masculino"); await expect(rows).toHaveCount(3);
    await page.getByLabel("Categoria", { exact: true }).selectOption({ label: "camisetas" }); await expect(rows).toHaveCount(3);
    await page.getByLabel("Buscar por nome").fill(prefix + 2); await expect(rows).toHaveCount(1);
    await row(2).getByRole("button", { name: "Remover do carrossel" }).click(); await expectSuccess(page, "Produto removido do carrossel!", "removal");
    await expect(rows).toHaveCount(0);
    await page.getByLabel("Apenas itens do carrossel", { exact: true }).uncheck();
    await expect(rows).toHaveCount(1);
    await page.route(`**/api/produtos/${ids[2]}/carrossel`, route => route.fulfill({ status: 409, json: { error: "Limite de 5 produtos no carrossel." } }));
    await row(2).getByRole("button", { name: "Adicionar ao carrossel" }).click();
    await expect(page.locator('[data-sonner-toast][data-type="error"]')).toContainText("Limite de 5 produtos");
    await expect(successToasts(page)).toHaveCount(0);
    await page.unroute(`**/api/produtos/${ids[2]}/carrossel`);
    await page.reload(); await page.getByLabel("Buscar por nome").fill(prefix);
    await expect(page.getByRole("button", { name: "Remover do carrossel" })).toHaveCount(4);
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await row(0).getByRole("button", { name: "Excluir", exact: true }).click();
    await page.getByRole("button", { name: "Confirmar exclusão" }).click();
    await expectSuccess(page, "Produto excluído com sucesso!", "removal");
    await page.getByRole("link", { name: "Ver loja", exact: true }).click();
    await expect(page.getByRole("region", { name: "Carrossel de produtos" }).locator("article")).toHaveCount(3);
  } finally {
    for (const id of ids) await page.request.delete(`/api/produtos/${id}`, { headers });
  }
});
