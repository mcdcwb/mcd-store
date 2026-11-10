import { test, expect, type Page } from "@playwright/test";
import { expectSuccess, successToasts } from "./toast-helpers";
import { randomUUID } from "node:crypto";

async function login(page: Page, role: "ADMIN" | "USER" = "ADMIN") {
  await page.goto("/manager");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.getByLabel("E-mail", { exact: true }).fill(process.env[role === "ADMIN" ? "E2E_ADMIN_EMAIL" : "E2E_USER_EMAIL"]!);
  await page.getByLabel("Senha", { exact: true }).fill(process.env[role === "ADMIN" ? "E2E_ADMIN_PASSWORD" : "E2E_USER_PASSWORD"]!);
  await page.locator('form button[type="submit"]').click();
  if (role === "ADMIN") await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
  else await expect(page.getByRole("heading", { name: "Acesso restrito" })).toBeVisible();
}
async function token(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem("mcd-store_auth_v1")!).accessToken as string);
}

async function mockAdmin(page: Page) {
  await page.route("**/api/categorias", route => route.fulfill({ json: [{ id: 1, name: "camisetas" }, { id: 2, name: "calcados" }] }));
  await page.route("**/api/settings", route => route.fulfill({ json: { lowStockThreshold: 5, showLowStockBadge: true, showLastUnitBadge: true } }));
  await page.route("**/api/orders/status-counts", route => route.fulfill({ json: { PENDING_CONFIRMATION: 0, PREPARING: 0, READY_OR_SHIPPED: 0, COMPLETED: 0, CANCELLED: 0 } }));
  await page.route("**/api/orders/reports", route => route.fulfill({ json: { revenue: "0.00", completedOrders: 0, averageTicket: "0.00", monthly: [], topProducts: [], lowestProducts: [] } }));
  await page.route("**/api/orders?**", route => route.fulfill({ json: { items: [], total: 0, page: 1, pageSize: 20, totalPages: 1 } }));
  const account = { id: 1, name: "Administrador de teste", email: "admin@example.test", role: "ADMIN" };
  await page.route("**/api/auth/me", route => route.fulfill({ json: { account } }));
  await page.route("**/api/auth/login", route => route.fulfill({ json: { account, accessToken: "test-session", tokenType: "Bearer", expiresIn: 3600, expiresAt: Date.now() + 3600000 } }));
}

for (const editing of [false, true]) test(`manual badge input limits, counter, preview and legacy edits (${editing ? "edit" : "create"})`, async ({ page }) => {
  await mockAdmin(page);
  let product = {
    id: 9900, name: "Badge form fixture", price: "30.00", public: "unissex", categoryId: 1, category: { id: 1, name: "camisetas" }, isPublished: true, inCarousel: false,
    badge: "LANÇAMENTO ANTIGO" as string | null, badgeBackgroundColor: "#ABCDEF", badgeTextColor: "#123456",
    colors: [{ id: 9901, colorName: "Preto", colorValue: "#111111", images: [], variants: [{ id: 9902, value: "P", stock: 1 }] }]
  };
  const writes: Record<string, any>[] = [];
  const save = (body: Record<string, any>) => {
    writes.push(body);
    product = {
      ...product, ...body, colors: body.colors?.map((color: any, index: number) => ({
        ...color, id: color.id ?? 9901 + index,
        variants: color.variants.map((variant: any, i: number) => ({ ...variant, id: variant.id ?? 9910 + i }))
      })) ?? product.colors
    };
  };
  await page.route("**/api/produtos{,/admin}", route => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON(); save(body);
      return route.fulfill({ status: 201, json: product });
    }
    return route.fulfill({ json: [product] });
  });
  await page.route("**/api/produtos/9900", route => {
    const body = route.request().postDataJSON(); save(body);
    return route.fulfill({ json: product });
  });
  await login(page);
  const path = editing ? "/manager/produtos/9900/editar" : "/manager/produtos/novo";
  await page.goto(path);
  const input = page.getByLabel("Badge (opcional)", { exact: true }), preview = page.getByLabel("Prévia do badge", { exact: true });
  await expect(input).toHaveAttribute("maxlength", "12");
  if (editing) {
    await expect(input).toHaveValue("LANÇAMENTO ANTIGO"); await expect(page.getByText("17/12", { exact: true })).toBeVisible();
    await page.getByLabel("Nome", { exact: true }).fill("Outro nome do produto");
    await page.getByRole("button", { name: "Salvar produto", exact: true }).click();
    await expectSuccess(page, "Produto salvo com sucesso!", "positive");
    expect(writes[0]).not.toHaveProperty("badge"); expect(product.badge).toBe("LANÇAMENTO ANTIGO");
    await page.goto(path);
  } else {
    await page.getByLabel("Nome", { exact: true }).fill("Badge de criação");
    await page.getByLabel("Preço (R$)", { exact: true }).fill("30");
    await page.getByLabel("Nome da cor", { exact: true }).fill("Preto");
    await page.getByLabel("Valor da cor", { exact: true }).fill("#111111");
    await page.getByLabel("Variante 1", { exact: true }).fill("P");
  }
  await input.fill(""); await input.pressSequentially("123456789012345");
  await expect(input).toHaveValue("123456789012"); await expect(page.getByText("12/12", { exact: true })).toBeVisible();
  await expect(preview.locator(".product-tag-label")).toHaveText("123456789012");
  await input.fill("NOVIDADE"); await expect(page.getByText("8/12", { exact: true })).toBeVisible();
  await expect(preview.locator(".product-tag-label")).toHaveText("NOVIDADE");
  if (editing) { await expect(preview.locator("path")).toHaveAttribute("fill", "#ABCDEF"); await expect(preview.locator(".product-tag")).toHaveCSS("color", "rgb(18, 52, 86)"); }
  await page.getByRole("button", { name: "Salvar produto", exact: true }).click();
  await expectSuccess(page, editing ? "Produto salvo com sucesso!" : "Produto criado com sucesso!", "positive");
  expect(writes.at(-1)!.badge).toBe("NOVIDADE");
  await page.goto("/manager/produtos/9900/editar");
  await input.fill(""); await expect(page.getByText("0/12", { exact: true })).toBeVisible();
  await expect(preview.locator(".product-tag")).toHaveCount(0);
  await page.getByRole("button", { name: "Salvar produto", exact: true }).click();
  await expectSuccess(page, "Produto salvo com sucesso!", "positive"); expect(writes.at(-1)!.badge).toBeNull();
});

for (const width of [1440, 390, 320]) test(`dashboard stock shortcuts, keyboard and layout at ${width}px`, async ({ page }, testInfo) => {
  await mockAdmin(page);
  const fixture = [[], [0, 0], [0, 1], [2, 3], [3, 3]].map((stocks, index) => ({
    id: 800 + index, name: `Resumo ${index}`, description: "", price: "20", public: "unissex", category: "camisetas", categoryId: 1, badge: null, inCarousel: index === 2,
    colors: (stocks.length ? stocks : [null]).map((stock, color) => ({ id: 900 + index * 10 + color, colorName: `Cor ${color}`, colorValue: "#111111", imageUrl: null, images: [], variants: stock === null ? [] : [{ id: 1000 + index * 10 + color, value: "P", stock }] }))
  }));
  await page.setViewportSize({ width, height: 1100 });
  await page.route("**/api/produtos{,/admin}", route => route.fulfill({ json: fixture }));
  await login(page);
  const total = page.getByRole("link", { name: /Total de produtos/ });
  const empty = page.getByRole("link", { name: /Produtos sem estoque/ });
  const low = page.getByRole("link", { name: /Variantes com estoque baixo/ });
  const variants = page.getByRole("region", { name: "Total de variantes" });
  await expect(total).toContainText("5");
  await expect(empty.locator("p").first()).toHaveText("1");
  await expect(low.locator("p").first()).toHaveText("5");
  await expect(page.getByRole("heading", { name: "Produtos com estoque baixo", exact: true })).toHaveCount(0);
  await expect(variants).not.toContainText("com estoque baixo");
  await expect(variants).toContainText("8");
  await expect(variants).toContainText("5 com estoque");
  await expect(variants.getByRole("link", { name: "Ver 3 variantes sem estoque" })).toHaveCount(1);
  await expect(variants).not.toContainText("Ver produtos");
  await expect(variants).toHaveCSS("cursor", "auto");
  await expect(page.locator("main > div.grid").filter({ has: total }).locator(":scope > a, :scope > section")).toHaveCount(4);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await total.scrollIntoViewIfNeeded();
  await page.mouse.move(0, 0);
  await expect(total).toHaveCSS("translate", "none");
  const normal = await total.boundingBox();
  const sibling = await variants.boundingBox();
  await total.hover();
  await expect.poll(async () => Math.round((await total.boundingBox())!.y - normal!.y)).toBe(-2);
  expect(await variants.boundingBox()).toEqual(sibling);
  await page.screenshot({ path: testInfo.outputPath(`dashboard-${width}.png`), fullPage: true });
  await page.keyboard.press("Tab");
  await total.focus();
  await expect(total).toHaveCSS("outline-style", "solid");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/manager\/produtos$/);
  await expect(page.getByRole("article")).toHaveCount(5);
  await expect(page.getByLabel("Estoque", { exact: true }).locator("option")).toHaveText([
    "Todos os estoques", "Produtos sem estoque", "Variantes sem estoque", "Variantes com estoque baixo"
  ]);
  await page.goto("/manager/produtos?estoque=baixo&preservado=sim");
  await expect(page).toHaveURL(/\/manager\/produtos\?preservado=sim$/);
  await expect(page.getByLabel("Estoque", { exact: true })).toHaveValue("");
  await expect(page.getByRole("article")).toHaveCount(5);
  await expect(page.getByRole("article", { name: "Resumo 0", exact: true })).toContainText("Sem variantes");
  for (const [label, query, names] of [
    ["Produtos sem estoque", "sem-estoque", ["Resumo 1"]],
    ["Variantes com estoque baixo", "variante-baixo", ["Resumo 2", "Resumo 3", "Resumo 4"]]
  ] as const) {
    await page.getByRole("link", { name: "Dashboard", exact: true }).click();
    await page.getByRole("link", { name: new RegExp(label) }).click({ position: { x: 8, y: 8 } });
    await expect(page).toHaveURL(new RegExp(`estoque=${query}$`));
    await expect(page.getByLabel("Estoque", { exact: true })).toHaveValue(query);
    await expect(page.getByText(`Filtro: ${query === "variante-baixo" ? "Variantes com estoque baixo" : "Produtos sem estoque"}`, { exact: true })).toBeVisible();
    await expect(page.getByRole("article")).toHaveCount(names.length);
    for (const name of names) await expect(page.getByRole("article", { name, exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Estoque", { exact: true })).toHaveValue(query);
    await expect(page.getByRole("article")).toHaveCount(names.length);
    await page.getByRole("searchbox").fill(names[0]);
    await expect(page.getByRole("article")).toHaveCount(1);
    await page.getByRole("button", { name: "Remover filtro de estoque" }).click();
    await expect(page.getByRole("searchbox")).toHaveValue(names[0]);
    await page.getByRole("searchbox").fill("");
    await expect(page.getByRole("article")).toHaveCount(5);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.getByLabel("Estoque", { exact: true }).selectOption("variante-baixo");
  await page.getByRole("checkbox", { name: /carrossel/i }).check();
  await expect(page.getByRole("article")).toHaveCount(1);
  await page.getByLabel("Categoria", { exact: true }).selectOption({ label: "camisetas" });
  await page.getByLabel("Público", { exact: true }).selectOption("unissex");
  await expect(page.getByRole("article", { name: "Resumo 2", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Dashboard", exact: true }).click();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await empty.hover();
  await expect(empty).toHaveCSS("transform", "none");
  await expect(empty).toHaveCSS("translate", "none");
  await expect(empty.locator("svg")).toHaveCSS("transform", "none");
  await low.hover();
  await expect(low).toHaveCSS("translate", "none");
  await expect(low.locator("svg")).toHaveCSS("transform", "none");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.keyboard.press("Tab");
  await low.focus();
  await expect(low).toHaveCSS("outline-style", "solid");
  await expect(low).toHaveCSS("transition-duration", "0.2s");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/estoque=variante-baixo$/);
  await expect(page.getByRole("article")).toHaveCount(3);
  await page.getByRole("link", { name: "Dashboard", exact: true }).click();
  await total.click();
  await expect(page.getByRole("article")).toHaveCount(5);
  await expect(page.getByLabel("Estoque", { exact: true })).toHaveValue("");
});

for (const width of [1440, 390, 320]) test(`variant availability link and identification at ${width}px`, async ({ page }, testInfo) => {
  await mockAdmin(page);
  const fixture = [
    { name: "Misto", category: "calcados", public: "feminino", inCarousel: true, stocks: [[3, 0], [0, 5]] },
    { name: "Zerado", category: "camisetas", public: "masculino", inCarousel: false, stocks: [[0, 0]] },
    { name: "Disponível", category: "calcados", public: "feminino", inCarousel: true, stocks: [[3, 2]] },
    { name: "Sem variantes", category: "camisetas", public: "unissex", inCarousel: false, stocks: [[]] }
  ].map((p, i) => ({
    ...p, categoryId: p.category === "camisetas" ? 1 : 2, id: 700 + i, price: 20, description: "", badge: null, colors: p.stocks.map((stocks, c) => ({
      id: 800 + i * 10 + c, colorName: c ? "Branco" : "Preto", colorValue: c ? "#FFFFFF" : "#111111", images: [], imageUrl: null,
      variants: stocks.map((stock, v) => ({ id: 900 + i * 100 + c * 10 + v, value: v ? "M" : "P", stock }))
    }))
  }));
  await page.route("**/api/produtos{,/admin}", route => route.fulfill({ json: fixture }));
  await page.setViewportSize({ width, height: 1000 });
  await login(page);
  const card = page.getByRole("region", { name: "Total de variantes" });
  await expect(card.locator("p").first()).toHaveText("8");
  await expect(card).toContainText("4 com estoque · 4 sem estoque");
  await expect(card).toHaveCSS("cursor", "auto");
  await card.click({ position: { x: 8, y: 8 } });
  await expect(page).toHaveURL(/\/manager$/);
  const link = card.getByRole("link", { name: "Ver 4 variantes sem estoque" });
  await link.focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(link).toBeFocused();
  await expect(link).toHaveCSS("outline-style", "solid");
  await page.screenshot({ path: testInfo.outputPath(`variants-dashboard-${width}.png`), fullPage: true });
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/estoque=variante-sem-estoque$/);
  await expect(page.getByLabel("Estoque", { exact: true })).toHaveValue("variante-sem-estoque");
  await expect(page.getByText("Filtro: Variantes sem estoque", { exact: true })).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(1);
  const mixed = page.getByRole("article", { name: "Misto", exact: true });
  const empty = page.getByRole("article", { name: "Zerado", exact: true });
  await expect(mixed.getByText("Preto / M — Sem estoque", { exact: true })).toBeVisible();
  await expect(mixed.getByText("Branco / P — Sem estoque", { exact: true })).toBeVisible();
  await expect(empty).toHaveCount(0);
  await expect(page.getByText(/— Sem estoque$/)).toHaveCount(2);
  await page.reload();
  await expect(page.getByLabel("Estoque", { exact: true })).toHaveValue("variante-sem-estoque");
  await expect(page.getByRole("article")).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath(`variants-list-${width}.png`), fullPage: true });
  await page.getByLabel("Categoria", { exact: true }).selectOption({ label: "calcados" });
  await page.getByLabel("Público", { exact: true }).selectOption("feminino");
  await page.getByRole("checkbox", { name: /carrossel/i }).check();
  await page.getByRole("searchbox").fill("Misto");
  await expect(page.getByRole("article")).toHaveCount(1);
  await expect(mixed).toBeVisible();
  await page.getByRole("searchbox").fill("Disponível");
  await expect(page.getByRole("article")).toHaveCount(0);
  await page.getByRole("button", { name: "Remover filtro de estoque" }).click();
  await expect(page.getByRole("article", { name: "Disponível", exact: true })).toBeVisible();
  await expect(page.getByText(/— Sem estoque$/)).toHaveCount(0);
  await page.goto("/manager/produtos?estoque=sem-estoque");
  await expect(page.getByRole("article")).toHaveCount(1);
  await expect(page.getByRole("article", { name: "Sem variantes", exact: true })).toHaveCount(0);
  await expect(empty).toBeVisible();
  await expect(mixed).toHaveCount(0);
  for (const p of fixture) for (const c of p.colors) for (const v of c.variants) v.stock = 1;
  await page.goto("/manager");
  await expect(card).toContainText("8 com estoque · 0 sem estoque");
  await expect(card.getByRole("link", { name: /variantes sem estoque/ })).toHaveCount(0);
  await expect(card.getByText("0 sem estoque", { exact: true })).toHaveCSS("cursor", "auto");
});

test("variant availability in the current catalog is read-only", async ({ page }, testInfo) => {
  await mockAdmin(page);
  const response = await page.request.get("/api/produtos");
  expect(response.ok()).toBe(true);
  const products = await response.json();
  const partial = products.filter((p: any) => p.colors.some((c: any) => c.variants.some((v: any) => v.stock > 0)));
  const zero = products.flatMap((p: any) => p.colors.flatMap((c: any) => c.variants.filter((v: any) => v.stock === 0).map((v: any) => ({ product: p.name, color: c.colorName, size: v.value }))));
  await testInfo.attach("current-empty-variants", { body: JSON.stringify(zero, null, 2), contentType: "application/json" });
  await page.route("**/api/produtos{,/admin}", route => route.fulfill({ json: products }));
  await login(page);
  const card = page.getByRole("region", { name: "Total de variantes" });
  await expect(card).toContainText(`${zero.length} sem estoque`);
  if (!zero.length) { await expect(card.getByRole("link", { name: /variantes sem estoque/ })).toHaveCount(0); return; }
  await card.getByRole("link", { name: /variantes sem estoque/ }).click();
  const eligible = zero.filter((v: any) => partial.some((p: any) => p.name === v.product));
  await expect(page.getByRole("article")).toHaveCount(new Set(eligible.map((v: any) => v.product)).size);
  for (const variant of eligible) await expect(page.getByRole("article", { name: variant.product, exact: true }).getByText(`${variant.color} / ${variant.size} — Sem estoque`, { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("current-empty-variants.png"), fullPage: true });
});

test("color picker and image eyedropper synchronize HEX and persist during creation and editing", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "EyeDropper", {
      configurable: true, value: class {
        async open() {
          const image = document.querySelector('img[alt="Prévia do produto"]')!;
          const bounds = image.getBoundingClientRect();
          if (bounds.top < 0 || bounds.bottom > innerHeight || getComputedStyle(image.closest("fieldset")!).opacity !== "1") throw new Error("Preview must be visible and undimmed");
          return { sRGBHex: "#a1b2c3" };
        }
      }
    });
  });
  await page.route("**/color-fixture.svg", route => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="#a1b2c3"/></svg>' }));
  await login(page);
  const headers = { Authorization: `Bearer ${await token(page)}` };
  let id: number | undefined;
  try {
    await page.getByRole("link", { name: "Produtos", exact: true }).click();
    await page.getByRole("link", { name: "Novo produto" }).click();
    await expect(page.getByRole("button", { name: "Selecionar na imagem" })).toBeDisabled();
    const name = "Color fixture " + randomUUID();
    await page.getByLabel("Nome", { exact: true }).fill(name);
    await page.getByLabel("Preço (R$)", { exact: true }).fill("25");
    await page.getByLabel("Variante 1", { exact: true }).fill("P");
    await page.getByLabel("Nome da cor", { exact: true }).fill("Off White");
    await page.getByLabel("Imagem principal", { exact: true }).fill("/color-fixture.svg");
    const picker = page.getByLabel("Seletor de cor", { exact: true });
    const hex = page.getByLabel("Valor da cor", { exact: true });
    await picker.fill("#112233");
    await expect(hex).toHaveValue("#112233");
    await hex.fill("#ab12ef");
    await expect(hex).toHaveValue("#AB12EF");
    await expect(picker).toHaveValue("#ab12ef");
    await hex.fill("not-hex");
    await page.getByRole("button", { name: "Salvar produto" }).click();
    await expect(page.getByRole("alert")).toContainText("#RRGGBB");
    await page.getByRole("button", { name: "Selecionar na imagem" }).click();
    await expect(hex).toHaveValue("#A1B2C3");
    await expect(picker).toHaveValue("#a1b2c3");
    await expect(page.getByLabel("Nome da cor", { exact: true })).toHaveValue("Off White");
    const created = page.waitForResponse(r => r.url().endsWith("/api/produtos") && r.request().method() === "POST");
    await page.getByRole("button", { name: "Salvar produto" }).click();
    const response = await created;
    expect(response.status()).toBe(201);
    expect(response.request().postDataJSON().colors[0].colorValue).toBe("#A1B2C3");
    const product = await response.json(); id = product.id;
    expect(product.colors[0].colorValue).toBe("#A1B2C3");
    await page.getByRole("article", { name, exact: true }).getByRole("link", { name: "Editar" }).click();
    await expect(picker).toHaveValue("#a1b2c3");
    await picker.fill("#123456");
    await page.getByRole("button", { name: "Selecionar na imagem" }).click();
    await expect(hex).toHaveValue("#A1B2C3");
    await picker.fill("#654321");
    const updated = page.waitForResponse(r => r.url().endsWith(`/api/produtos/${id}`) && r.request().method() === "PUT");
    await page.getByRole("button", { name: "Salvar produto" }).click();
    const saved = await updated;
    expect(saved.status()).toBe(200);
    expect(saved.request().postDataJSON().colors[0].colorValue).toBe("#654321");
    expect((await saved.json()).colors[0].colorValue).toBe("#654321");
  } finally { if (id) await page.request.delete(`/api/produtos/${id}`, { headers }); }
});

for (const behavior of ["unsupported", "cancelled", "failed"]) {
  test(`image eyedropper ${behavior} preserves color and the responsive form remains usable`, async ({ page }) => {
    await page.addInitScript(behavior => {
      Object.defineProperty(window, "EyeDropper", {
        configurable: true, value: behavior === "unsupported" ? undefined : class {
          async open() { throw new DOMException("test", behavior === "cancelled" ? "AbortError" : "OperationError"); }
        }
      });
    }, behavior);
    await login(page);
    await page.getByRole("link", { name: "Produtos", exact: true }).click();
    await page.getByRole("link", { name: "Novo produto" }).click();
    await page.getByLabel("Imagens adicionais", { exact: true }).fill("/color-fixture.svg");
    await page.getByLabel("Valor da cor", { exact: true }).fill("#abcdef");
    const button = page.getByRole("button", { name: "Selecionar na imagem" });
    if (behavior === "unsupported") {
      await expect(button).toBeDisabled();
      await expect(page.getByText(/Conta-gotas indisponível neste navegador/)).toBeVisible();
    } else {
      await button.click();
      await expect(page.getByRole("status")).toContainText(behavior === "cancelled" ? "Seleção cancelada" : "Não foi possível selecionar");
      await expect(button).toBeEnabled();
    }
    await expect(page.getByLabel("Valor da cor", { exact: true })).toHaveValue("#ABCDEF");
    await expect(page.getByLabel("Seletor de cor", { exact: true })).toHaveValue("#abcdef");
    await page.getByLabel("Seletor de cor", { exact: true }).fill("#102030");
    await expect(page.getByLabel("Valor da cor", { exact: true })).toHaveValue("#102030");
    await expect(page.getByRole("button", { name: "Salvar produto" })).toBeEnabled();
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  });
}

test("anonymous and USER accounts cannot access administrative routes or mutate products", async ({ page }) => {
  await page.goto("/manager/produtos/novo");
  await expect(page.getByRole("heading", { name: "Acesso administrativo" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Salvar produto" })).toHaveCount(0);
  await login(page, "USER");
  const accessToken = await token(page);
  for (const path of ["/manager", "/manager/produtos", "/manager/produtos/novo", "/manager/produtos/1/editar"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: "Acesso restrito" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Navegação administrativa" })).toHaveCount(0);
  }
  const response = await page.request.post("/api/produtos", { headers: { Authorization: `Bearer ${accessToken}` }, data: {} });
  expect(response.status()).toBe(403);
});

test("ADMIN login redirects to manager, dashboard uses real totals and mobile navigation fits", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Entrar", exact: true }).first().click();
  await page.getByLabel("E-mail", { exact: true }).fill(process.env.E2E_ADMIN_EMAIL!);
  await page.getByLabel("Senha", { exact: true }).fill(process.env.E2E_ADMIN_PASSWORD!);
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/\/manager$/);
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
  const products = await (
    await page.request.get("/api/produtos/admin", {
      headers: {
        Authorization: `Bearer ${await token(page)}`,
      },
    })
  ).json();
  type StockProduct = { colors: { variants: { stock: number }[] }[] };
  const variantsOf = (p: StockProduct) => p.colors.flatMap(c => c.variants);
  const { lowStockThreshold } = await (await page.request.get("/api/settings", { headers: { Authorization: `Bearer ${await token(page)}` } })).json();
  const checks = [
    ["Total de produtos", products.length],
    ["Total de variantes (cor/tamanho)", products.reduce((sum: number, p: StockProduct) => sum + p.colors.reduce((n, c) => n + c.variants.length, 0), 0)],
    ["Produtos sem estoque", products.filter((p: StockProduct) => variantsOf(p).length > 0 && variantsOf(p).every(v => v.stock === 0)).length],
    ["Variantes com estoque baixo", products.reduce((n: number, p: StockProduct) => n + variantsOf(p).filter(v => v.stock >= 1 && v.stock <= lowStockThreshold).length, 0)]
  ];
  for (const [label, count] of checks) await expect(page.getByRole("heading", { name: String(label), exact: true }).locator("..").locator("p").first()).toHaveText(String(count));
  await page.reload();
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.screenshot({ path: testInfo.outputPath("manager-desktop.png"), fullPage: true });
  await page.getByRole("link", { name: "Ver loja", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("real manager CRUD validates variants, saves stock, filters, edits and deletes with confirmation", async ({ page }) => {
  await login(page);
  const headers = { Authorization: `Bearer ${await token(page)}` };
  const name = "Manager teste " + randomUUID();
  let id: number | undefined;
  try {
    await page.getByRole("link", { name: "Produtos", exact: true }).click();
    await page.getByRole("link", { name: "Novo produto" }).click();
    await page.getByLabel("Nome", { exact: true }).fill(name);
    await page.getByLabel("Descrição", { exact: true }).fill("Produto temporário do teste de integração.");
    await page.getByLabel("Preço (R$)", { exact: true }).fill("149.90");
    await page.getByLabel("Público", { exact: true }).selectOption("feminino");
    await page.getByLabel("Categoria", { exact: true }).selectOption({ label: "calcados" });
    await page.getByLabel("Nome da cor", { exact: true }).fill("Preto");
    await page.getByLabel("Valor da cor", { exact: true }).fill("#111111");
    await page.getByLabel("Badge (opcional)", { exact: true }).fill("Novo");
    await page.getByLabel("Imagem principal", { exact: true }).fill("https://placehold.co/400x500");
    await page.getByLabel("Imagens adicionais", { exact: true }).fill("https://placehold.co/400x600");
    await page.getByLabel("Variante 1", { exact: true }).fill("38");
    await page.getByLabel("Estoque 1", { exact: true }).fill("-1");
    await page.getByRole("button", { name: "Salvar produto" }).click();
    await expect(page.getByRole("alert")).toContainText("estoque deve ser inteiro");
    await page.getByLabel("Estoque 1", { exact: true }).fill("2");
    await page.getByRole("button", { name: "Adicionar variante" }).click();
    await page.getByLabel("Variante 2", { exact: true }).fill("38");
    await page.getByRole("button", { name: "Salvar produto" }).click();
    await expect(page.getByRole("alert")).toContainText("duplicada");
    await page.getByLabel("Variante 2", { exact: true }).fill("Sob medida");
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    let posts = 0;
    await page.route("**/api/produtos{,/admin}", async route => {
      if (route.request().method() === "POST") { posts++; await gate; }
      await route.continue();
    });
    const created = page.waitForResponse(response => response.url().endsWith("/api/produtos") && response.request().method() === "POST");
    await page.getByRole("button", { name: "Salvar produto" }).click();
    await expect(page.getByRole("button", { name: "Salvando..." })).toBeDisabled();
    await expect(page.getByLabel("Nome", { exact: true })).toBeDisabled();
    await expect.poll(() => posts).toBe(1);
    await expect(successToasts(page)).toHaveCount(0);
    release();
    const response = await created;
    expect(response.status()).toBe(201);
    id = (await response.json()).id;
    await expectSuccess(page, "Produto criado com sucesso!");
    await page.getByLabel("Buscar por nome").fill(name);
    await page.getByLabel("Categoria", { exact: true }).selectOption({ label: "calcados" });
    await page.getByLabel("Público", { exact: true }).selectOption("feminino");
    const row = page.getByRole("article", { name, exact: true });
    await expect(row).toContainText("Disponível");
    await expect(row).toContainText("Sob medida: 0");
    await row.getByRole("link", { name: "Editar" }).click();
    await expect(page.getByLabel("Nome", { exact: true })).toHaveValue(name);
    await page.getByLabel("Estoque 1", { exact: true }).fill("9");
    await page.getByRole("button", { name: "Remover variante 2" }).click();
    await page.getByRole("button", { name: "Salvar produto" }).click();
    await expectSuccess(page, "Produto salvo com sucesso!");
    const saved = (await (await page.request.get("/api/produtos")).json()).find((p: { id: number }) => p.id === id);
    expect(saved.colors[0].variants.map((v: { value: string; stock: number }) => ({ value: v.value, stock: v.stock }))).toEqual([{ value: "38", stock: 9 }]);
    expect(Number(saved.price)).toBe(149.9);
    await page.getByRole("link", { name: "Ver loja", exact: true }).click();
    await expect(page.locator("main").getByText(name, { exact: true })).toBeVisible();
    await page.goBack();
    await expect(row).toBeVisible();
    await row.getByRole("link", { name: "Editar" }).click();
    await page.getByRole("button", { name: "Remover variante 1" }).click();
    await page.getByRole("button", { name: "Salvar produto" }).click();
    await expectSuccess(page, "Produto salvo com sucesso!");
    await expect(row).toContainText("Sem variantes");
    await row.getByRole("button", { name: "Excluir", exact: true }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText(name);
    await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "Excluir", exact: true }).click();
    await dialog.getByRole("button", { name: "Confirmar exclusão" }).click();
    await expectSuccess(page, "Produto excluído com sucesso!", "removal");
    await expect(row).toHaveCount(0);
    expect((await (await page.request.get("/api/produtos")).json()).some((p: { id: number }) => p.id === id)).toBe(false);
  } finally {
    if (id !== undefined) await page.request.delete(`/api/produtos/${id}`, { headers });
  }
});

for (const status of [401, 403]) test(`administrative ${status} response removes access and token`, async ({ page }) => {
  await login(page);
  await page.getByRole("link", { name: "Produtos", exact: true }).click();
  await page.getByRole("link", { name: "Novo produto" }).click();
  await page.getByLabel("Nome", { exact: true }).fill("Não persistir");
  await page.getByLabel("Nome da cor", { exact: true }).fill("Preto");
  await page.getByLabel("Valor da cor", { exact: true }).fill("#111111");
  await page.getByLabel("Preço (R$)", { exact: true }).fill("10");
  await page.getByLabel("Variante 1", { exact: true }).fill("P");
  await page.route("**/api/produtos{,/admin}", route => route.request().method() === "POST" ? route.fulfill({ status, json: {} }) : route.continue());
  await page.getByRole("button", { name: "Salvar produto" }).click();
  await expect(page.getByRole("heading", { name: "Acesso administrativo" })).toBeVisible();
  await expect(page.getByRole("alert")).toContainText(status === 401 ? "sessão expirou" : "não autorizado");
  expect(await page.evaluate(() => localStorage.getItem("mcd-store_auth_v1"))).toBeNull();
});

test("manager remains hidden while /auth/me is validating the restored session", async ({ page }) => {
  await login(page);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/auth/me", async route => { await gate; await route.continue(); });
  await page.reload();
  await expect(page.getByRole("status")).toHaveText("Validando sessão...");
  await expect(page.getByRole("navigation", { name: "Navegação administrativa" })).toHaveCount(0);
  release();
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
});

test("save failure preserves the draft, allows retry and the form fits small screens", async ({ page }) => {
  await login(page);
  await page.getByRole("link", { name: "Produtos", exact: true }).click();
  await page.getByRole("link", { name: "Novo produto" }).click();
  await page.getByLabel("Nome", { exact: true }).fill("Rascunho preservado");
  await page.getByLabel("Nome da cor", { exact: true }).fill("Preto");
  await page.getByLabel("Valor da cor", { exact: true }).fill("#111111");
  await page.getByLabel("Preço (R$)", { exact: true }).fill("25");
  await page.getByLabel("Variante 1", { exact: true }).fill("Livre");
  await page.route("**/api/produtos{,/admin}", route => route.request().method() === "POST" ? route.fulfill({ status: 500, json: { error: "Falha temporária." } }) : route.continue());
  await page.getByRole("button", { name: "Salvar produto" }).click();
  await expect(page.getByRole("alert")).toContainText("Falha temporária");
  await expect(successToasts(page)).toHaveCount(0);
  await expect(page.getByLabel("Nome", { exact: true })).toHaveValue("Rascunho preservado");
  await expect(page.getByRole("button", { name: "Salvar produto" })).toBeEnabled();
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test("product filters align labels and controls on desktop and stack evenly on mobile", async ({ page }, testInfo) => {
  await login(page);
  await page.getByRole("link", { name: "Produtos", exact: true }).click();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const controls = [page.locator('input[type="search"]:visible'), page.locator('select[aria-label="Categoria"]:visible'), page.locator('select[aria-label="Público"]:visible')];
    for (const control of controls) await expect(control).toBeVisible();
    const boxes = await Promise.all(controls.map(control => control.boundingBox()));
    const labels = await Promise.all(controls.map(control => control.locator("..").locator("span").first().boundingBox()));
    expect(boxes.every(box => box && boxes[0] && Math.abs(box.height - boxes[0].height) <= 1)).toBe(true);
    if (width === 1440) {
      expect(boxes.every(box => box?.y === boxes[0]?.y)).toBe(true);
      expect(labels.every(box => box?.y === labels[0]?.y)).toBe(true);
    } else {
      expect(boxes.every(box => box?.width === boxes[0]?.width)).toBe(true);
      expect(boxes[1]!.y).toBeGreaterThan(boxes[0]!.y);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`filters-${width}.png`), fullPage: false });
  }
  await page.getByRole("link", { name: "Ver loja", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/manager");
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await page.goto("/manager");
  await page.getByRole("link", { name: "Voltar para a loja" }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("category product counts open the ID-filtered product list and the filter survives reload", async ({ page }) => {
  await login(page);
  await page.getByRole("link", { name: "Configurações", exact: true }).click();
  const counts = page.locator('section[aria-label="Categorias de produtos"] a[href*="categoria="]');
  await expect(counts.first()).toBeVisible();
  const categoryHref = await counts.first().getAttribute("href");
  const categoryId = new URL(categoryHref!, "http://localhost").searchParams.get("categoria")!;
  await counts.first().click();
  await expect(page).toHaveURL(new RegExp(`categoria=${categoryId}`));
  await expect(page.getByLabel("Categoria", { exact: true })).toHaveValue(categoryId);
  await page.reload(); await expect(page.getByLabel("Categoria", { exact: true })).toHaveValue(categoryId);
});

test("dashboard status cards and completed report card open pre-filtered orders immediately", async ({ page }) => {
  await login(page);
  for (const [status, label] of [["PENDING_CONFIRMATION", "Aguardando confirmação"], ["PREPARING", "Em preparação"], ["READY_OR_SHIPPED", "Pronto ou enviado"], ["COMPLETED", "Finalizado"], ["CANCELLED", "Cancelado"]] as const) {
    await expect(page.getByRole("link", { name: `Ver pedidos: ${label}`, exact: true })).toHaveAttribute("href", `/manager/pedidos?status=${status}`);
  }
  const requested: string[] = [];
  await page.route("**/api/orders?**", async route => { requested.push(new URL(route.request().url()).searchParams.get("status") ?? ""); await route.fulfill({ json: { items: [], total: 0, page: 1, pageSize: 20, totalPages: 1 } }); });
  await page.getByRole("link", { name: "Ver pedidos: Em preparação" }).click();
  await expect(page.getByLabel("Status", { exact: true })).toHaveValue("PREPARING");
  await expect.poll(() => requested.at(-1)).toBe("PREPARING");
  await page.getByRole("link", { name: "Relatórios", exact: true }).click();
  await page.getByRole("link", { name: "Ver pedidos concluídos", exact: true }).click();
  await expect(page.getByLabel("Status", { exact: true })).toHaveValue("COMPLETED");
  await expect.poll(() => requested.at(-1)).toBe("COMPLETED");
});

test("product edit actions use the highlighted yellow button with hover and keyboard focus", async ({ page }) => {
  await login(page); await page.getByRole("link", { name: "Produtos", exact: true }).click();
  const edit = page.getByRole("link", { name: "Editar", exact: true }).first();
  await expect(edit).toHaveClass(/bg-amber-100/);
  const background = await edit.evaluate(element => getComputedStyle(element).backgroundColor);
  await edit.hover(); await expect.poll(() => edit.evaluate(element => getComputedStyle(element).backgroundColor)).not.toBe(background);
  await edit.focus(); await page.keyboard.press("Tab"); await page.keyboard.press("Shift+Tab");
  await expect(edit).toBeFocused(); await expect(edit).toHaveCSS("outline-style", "solid");
});

test("administrator account forms update session email and never expose password values", async ({ page }) => {
  await login(page);
  let email = process.env.E2E_ADMIN_EMAIL!;
  await page.route("**/api/conta/admin", async route => {
    if (route.request().method() === "GET") return route.fulfill({ json: { account: { id: 1, name: email.split("@")[0], email, role: "ADMIN" } } });
    email = route.request().postDataJSON().email;
    return route.fulfill({ json: { account: { id: 1, name: email.split("@")[0], email, role: "ADMIN" } } });
  });
  await page.route("**/api/conta/admin/senha", route => route.fulfill({ json: { message: "Senha alterada com sucesso." } }));
  await page.getByRole("link", { name: "Minha Conta", exact: true }).click();
  await expect(page.getByLabel("E-mail", { exact: true })).toHaveValue(process.env.E2E_ADMIN_EMAIL!);
  await page.getByLabel("E-mail", { exact: true }).fill("admin-alterado@example.test");
  await page.getByRole("button", { name: "Salvar e-mail", exact: true }).click();
  await expect(page.getByText("E-mail atualizado com sucesso.", { exact: true })).toBeVisible();
  await expect(page.locator("aside")).toContainText("admin-alterado@example.test");
  await page.getByLabel("Senha atual", { exact: true }).fill("sensitive-current");
  await page.getByLabel("Nova senha", { exact: true }).fill("Sensitive-Next1");
  await page.getByLabel("Confirmar nova senha", { exact: true }).fill("Sensitive-Next1");
  await page.getByRole("button", { name: "Salvar nova senha", exact: true }).click();
  await expect(page.getByText("Senha alterada com sucesso.", { exact: true })).toBeVisible();
  await expect(page.locator("body")).not.toContainText("sensitive-current");
  await expect(page.locator("body")).not.toContainText("Sensitive-Next1");
});
