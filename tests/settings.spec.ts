import { test, expect, type Page } from "@playwright/test";
import { expectSuccess } from "./toast-helpers";

const products = [0, 2, 5, 6, 10, 11].map((stock, index) => ({
  id: index + 1, name: `Peça ${stock}`, price: 30, public: "unissex", category: "camisetas", categoryId: 1, inCarousel: index === 3,
  colors: [{ id: index + 1, colorName: "Preto", colorValue: "#111111", images: [], variants: [{ id: index + 1, value: "M", stock }] }]
}));
products.push({ ...products[0], id: 7, name: "Misto", colors: [{ ...products[0].colors[0], id: 7, variants: [{ id: 7, value: "P", stock: 0 }, { id: 8, value: "M", stock: 6 }, { id: 9, value: "G", stock: 11 }] }] });

async function setup(page: Page) {
  let threshold = 5, writes = 0, fail = false;
  let showLowStockBadge = true, showLastUnitBadge = true;
  const account = { id: 1, name: "Administrador", email: "settings@example.test", role: "ADMIN" };
  await page.route("**/api/auth/me", route => route.fulfill({ json: { account } }));
  await page.route("**/api/auth/login", route => route.fulfill({ json: { account, accessToken: "settings-test", tokenType: "Bearer", expiresIn: 3600, expiresAt: Date.now() + 3600000 } }));
  await page.route("**/api/orders/status-counts", route => route.fulfill({ json: { PENDING_CONFIRMATION: 0, PREPARING: 0, READY_OR_SHIPPED: 0, COMPLETED: 0, CANCELLED: 0 } }));
  await page.route("**/api/orders/reports", route => route.fulfill({ json: { revenue: "0.00", completedOrders: 0, averageTicket: "0.00" } }));
  await page.route("**/api/orders?*", route => route.fulfill({ json: { items: [], total: 0, page: 1, pageSize: 20, totalPages: 1 } }));
  await page.route("**/api/categorias", route => route.fulfill({ json: [{ id: 1, name: "camisetas" }] }));
  await page.route("**/api/produtos{,/admin}", route => route.fulfill({ json: products }));
  await page.route("**/api/settings", async route => {
    if (fail) return route.fulfill({ status: 500, json: { error: "Falha de configuração" } });
    if (route.request().method() === "PUT") {
      writes++;
      ({ lowStockThreshold: threshold, showLowStockBadge, showLastUnitBadge } = route.request().postDataJSON());
    }
    return route.fulfill({ json: { lowStockThreshold: threshold, showLowStockBadge, showLastUnitBadge } });
  });
  await page.route("**/api/settings/store", route => route.fulfill({ json: { address: null, whatsapp: null } }));
  await page.route("**/api/settings/public", route => route.fulfill({ json: { address: null, whatsapp: null, lowStockThreshold: threshold, showLowStockBadge, showLastUnitBadge } }));
  await page.goto("/manager");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.getByLabel("E-mail", { exact: true }).fill(account.email);
  await page.getByLabel("Senha", { exact: true }).fill("test-password");
  await page.locator('form button[type="submit"]').click();
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
  return { get writes() { return writes; }, get threshold() { return threshold; }, fail: (value: boolean) => { fail = value; } };
}

test("stock badge switches save independently, persist and support keyboard navigation", async ({ page }) => {
  await setup(page);
  await page.getByRole("link", { name: "Configurações", exact: true }).click();
  const low = page.getByRole("checkbox", { name: 'Exibir badge "Poucas unidades"', exact: true });
  const last = page.getByRole("checkbox", { name: 'Exibir badge "Última peça"', exact: true });
  await expect(low).toBeChecked(); await expect(last).toBeChecked();
  await low.focus();
  await page.keyboard.press("Tab");
  await expect(last).toBeFocused();
  await expect(last).toHaveCSS("outline-style", "solid");
  await page.keyboard.press("Space");
  await expect(last).not.toBeChecked(); await expect(low).toBeChecked();
  await page.getByRole("button", { name: "Salvar alterações", exact: true }).click();
  await expectSuccess(page, "Configurações salvas com sucesso!", "positive");
  await page.reload();
  await expect(last).not.toBeChecked(); await expect(low).toBeChecked();
  await low.uncheck(); await last.check();
  await page.getByRole("button", { name: "Salvar alterações", exact: true }).click();
  await expectSuccess(page, "Configurações salvas com sucesso!", "positive");
  await page.reload();
  await expect(low).not.toBeChecked(); await expect(last).toBeChecked();
  await expect(page.locator("#low-stock-threshold")).toHaveValue("5");
});

test("saved Manager switches control selected storefront badges and the red-disabled fallback", async ({ page }) => {
  await setup(page);
  const lastUnit = { ...products[1], id: 8, name: "Peça 1", colors: [{ ...products[1].colors[0], id: 8, variants: [{ id: 8, value: "M", stock: 1 }] }] };
  await page.route("**/api/produtos{,/admin}", route => route.fulfill({ json: [...products, lastUnit] }));
  for (const [showLow, showLast, expected] of [[true, false, "POUCAS UNIDADES"], [false, false, null], [false, true, "ÚLTIMA PEÇA"]] as const) {
    await page.goto("/manager");
    await page.getByRole("link", { name: "Configurações", exact: true }).click();
    await page.getByRole("checkbox", { name: 'Exibir badge "Poucas unidades"', exact: true }).setChecked(showLow);
    await page.getByRole("checkbox", { name: 'Exibir badge "Última peça"', exact: true }).setChecked(showLast);
    await page.getByRole("button", { name: "Salvar alterações", exact: true }).click();
    await expectSuccess(page, "Configurações salvas com sucesso!", "positive");
    await page.goto("/");
    const card = page.locator(".store-product-card").filter({ has: page.getByText("Peça 1", { exact: true }) });
    await expect(card.locator(".store-badge-automatic")).toHaveCount(0);
    await card.getByRole("button", { name: "M", exact: true }).click();
    if (expected) await expect(card.locator(".store-badge-automatic")).toHaveAccessibleName(expected);
    else await expect(card.locator(".store-badge-automatic")).toHaveCount(0);
  }
});

for (const width of [320, 390, 768, 1440]) test(`settings sections collapse independently and retain drafts at ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 1000 });
  const state = await setup(page);
  await page.getByRole("link", { name: "Configurações", exact: true }).click();
  const stock = page.getByRole("button", { name: "Estoque", exact: true });
  const store = page.getByRole("button", { name: "Dados da loja", exact: true });
  const categories = page.getByRole("button", { name: "Categorias de produtos", exact: true });
  const threshold = page.locator("#low-stock-threshold");
  const phone = page.getByLabel("Telefone / WhatsApp", { exact: true });
  const street = page.getByLabel("Rua / Logradouro", { exact: true });
  const opening = page.getByLabel("Abertura Segunda-feira", { exact: true });
  const category = page.getByLabel("Nova categoria", { exact: true });
  await expect(phone).toBeVisible(); await expect(category).toBeVisible();
  for (const header of [stock, store, categories]) {
    await expect(header).toHaveAttribute("aria-expanded", "true");
    const id = await header.getAttribute("aria-controls");
    expect(id).toBeTruthy();
    await expect(page.locator(`[id="${id}"]`)).toBeVisible();
  }
  await threshold.fill("8"); await street.fill("Rua do rascunho");
  await phone.fill("11999999999");
  await page.getByRole("checkbox", { name: "Segunda-feira aberto", exact: true }).check();
  await opening.fill("08:30"); await category.fill("Categoria pendente");
  const calls: string[] = [];
  page.on("request", request => { if (request.url().includes("/api/")) calls.push(request.method() + " " + request.url()); });
  await stock.click(); await expect(stock).toHaveAttribute("aria-expanded", "false");
  await expect(threshold).toBeHidden(); await expect(phone).toBeVisible(); await expect(category).toBeVisible();
  await store.click(); await expect(store).toHaveAttribute("aria-expanded", "false");
  await expect(phone).toBeHidden(); await expect(opening).toBeHidden(); await expect(category).toBeVisible();
  await categories.click(); await expect(categories).toHaveAttribute("aria-expanded", "false");
  await expect(category).toBeHidden();
  const headers = [stock, store, categories];
  const cardGeometry = async () => Promise.all(headers.map(header => header.evaluate(button => {
    const card = button.closest("section, form")!;
    const rect = card.getBoundingClientRect(), style = getComputedStyle(card);
    const center = rect.top + rect.height / 2;
    const title = button.querySelector("span")!, icon = button.querySelector("svg")!;
    return { height: rect.height, width: rect.width, top: rect.top, bottom: rect.bottom,
      paddingTop: style.paddingTop, paddingBottom: style.paddingBottom,
      titleOffset: title.getBoundingClientRect().top + title.getBoundingClientRect().height / 2 - center,
      iconOffset: icon.getBoundingClientRect().top + icon.getBoundingClientRect().height / 2 - center,
      titleFits: title.scrollWidth <= title.clientWidth };
  })));
  const collapsed = await cardGeometry();
  expect(new Set(collapsed.map(card => card.height)).size).toBe(1);
  expect(new Set(collapsed.map(card => card.width)).size).toBe(1);
  expect(collapsed[1].top - collapsed[0].bottom).toBe(collapsed[2].top - collapsed[1].bottom);
  for (const card of collapsed) {
    expect(card.paddingTop).toBe(card.paddingBottom);
    expect(card.titleOffset).toBeCloseTo(0, 3); expect(card.iconOffset).toBeCloseTo(0, 3); expect(card.titleFits).toBe(true);
  }
  await page.screenshot({ path: info.outputPath(`settings-collapsed-${width}.png`), fullPage: true });
  for (let index = 0; index < headers.length; index++) {
    await headers[index].click();
    const expanded = await cardGeometry();
    expect(expanded[index].height).toBeGreaterThan(collapsed[index].height);
    expect(expanded[index].width).toBe(collapsed[index].width);
    await headers[index].click();
    expect((await cardGeometry())[index].height).toBe(collapsed[index].height);
  }
  await categories.focus(); await page.keyboard.press("Enter");
  await expect(categories).toHaveAttribute("aria-expanded", "true"); await expect(category).toHaveValue("Categoria pendente");
  await store.focus(); await page.keyboard.press("Space");
  await expect(store).toHaveAttribute("aria-expanded", "true");
  await expect(phone).toHaveValue("11999999999"); await expect(street).toHaveValue("Rua do rascunho"); await expect(opening).toHaveValue("08:30");
  await stock.click(); await expect(threshold).toHaveValue("8");
  expect(state.writes).toBe(0); expect(calls).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath(`settings-sections-${width}.png`), fullPage: true });
  await page.getByRole("button", { name: "Salvar alterações", exact: true }).click();
  expect(state.writes).toBe(1); expect(state.threshold).toBe(8);
  await page.reload();
  for (const title of ["Estoque", "Dados da loja", "Categorias de produtos"]) await expect(page.getByRole("button", { name: title, exact: true })).toHaveAttribute("aria-expanded", "true");
  await expect(threshold).toHaveValue("8");
});

for (const width of [1440, 390, 320]) test(`settings persist and update product and variant filters at ${width}px`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 1000 });
  const state = await setup(page);
  const lowVariant = page.getByRole("link", { name: /Variantes com estoque baixo/ });
  await expect(lowVariant.locator("p").first()).toHaveText("2");
  await page.getByRole("link", { name: "Configurações", exact: true }).click();
  await expect(page).toHaveURL(/\/manager\/settings$/);
  await expect(page.getByRole("link", { name: "Configurações", exact: true })).toHaveAttribute("aria-current", "page");
  const input = page.getByLabel("Limite de estoque baixo");
  const save = page.getByRole("button", { name: "Salvar alterações" });
  await expect(input).toHaveValue("5");
  await expect(save).toBeDisabled();
  for (const invalid of ["", "0", "-1", "1.5", "10000"]) {
    await input.fill(invalid); await save.click();
    await expect(page.getByRole("alert")).toContainText("inteiro entre 1 e 9999");
  }
  expect(state.writes).toBe(0);
  await input.fill("10");
  await expect(page.getByText("Variantes com estoque entre 1 e 10 unidades serão consideradas com estoque baixo.", { exact: false })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath(`settings-${width}.png`), fullPage: true });
  await save.click();
  await expectSuccess(page, "Configurações salvas com sucesso!", "positive");
  expect(state.writes).toBe(1);
  await expect(save).toBeDisabled();
  await page.reload();
  await expect(input).toHaveValue("10");
  await page.getByRole("link", { name: "Dashboard", exact: true }).click();
  await expect(lowVariant.locator("p").first()).toHaveText("5");
  await expect(page.getByRole("region", { name: "Total de variantes" })).not.toContainText("com estoque baixo");
  await page.screenshot({ path: testInfo.outputPath(`settings-dashboard-${width}.png`), fullPage: true });
  await lowVariant.focus(); await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/estoque=variante-baixo$/);
  await expect(page.getByRole("article")).toHaveCount(5);
  await expect(page.getByLabel("Estoque", { exact: true })).toHaveValue("variante-baixo");
  const mixed = page.getByRole("article", { name: "Misto", exact: true });
  await expect(mixed.getByText("Preto / M — 6 unidades (estoque baixo)", { exact: true })).toBeVisible();
  await expect(mixed.getByText("Preto / P — 0 unidades (estoque baixo)", { exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("article")).toHaveCount(5);
  await page.screenshot({ path: testInfo.outputPath(`settings-list-${width}.png`), fullPage: true });
  await page.getByLabel("Categoria", { exact: true }).selectOption({ label: "camisetas" });
  await page.getByLabel("Público", { exact: true }).selectOption("unissex");
  await page.getByRole("checkbox", { name: /carrossel/i }).check();
  await page.getByRole("searchbox").fill("Peça 6");
  await expect(page.getByRole("article")).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("link", { name: "Configurações", exact: true }).click();
  await input.fill("1"); await save.click();
  await expect(save).toBeDisabled();
  await page.getByRole("link", { name: "Dashboard", exact: true }).click();
  await expect(lowVariant.locator("p").first()).toHaveText("0");
  await lowVariant.click();
  await expect(page).toHaveURL(/estoque=variante-baixo$/);
  await expect(page.getByRole("article")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("settings failures preserve draft, prevent repeated submits and allow retry", async ({ page }) => {
  const state = await setup(page);
  await page.getByRole("link", { name: "Configurações", exact: true }).click();
  const input = page.getByLabel("Limite de estoque baixo");
  await input.fill("10");
  state.fail(true);
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(page.locator('[data-sonner-toast][data-type="error"]')).toHaveCount(1);
  await page.locator('[data-sonner-toast][data-type="error"]').getByRole("button", { name: "Fechar notificação" }).click();
  await expect(page.locator('[data-sonner-toast][data-type="error"]')).toHaveCount(0);
  await expect(input).toHaveValue("10");
  expect(state.threshold).toBe(5);
  state.fail(false);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let calls = 0;
  await page.route("**/api/settings", async route => {
    if (route.request().method() !== "PUT") return route.fallback();
    calls++; await gate; return route.fulfill({ json: { lowStockThreshold: 10, showLowStockBadge: true, showLastUnitBadge: true } });
  });
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(page.getByRole("button", { name: "Salvando..." })).toBeDisabled();
  await page.locator("main form").first().evaluate(form => { (form as HTMLFormElement).requestSubmit(); (form as HTMLFormElement).requestSubmit(); });
  expect(calls).toBe(1);
  release();
  await expectSuccess(page, "Configurações salvas com sucesso!", "positive");
  state.fail(true);
  await page.reload();
  await expect(page.getByRole("alert")).toContainText("Falha de configuração");
  await expect(input).toHaveCount(0);
  state.fail(false);
  await page.getByRole("button", { name: "Tentar novamente" }).click();
  await expect(input).toHaveValue("5");
});

test("settings page remains restricted to ADMIN", async ({ page }) => {
  await page.goto("/manager/settings");
  await expect(page.getByRole("heading", { name: "Acesso administrativo" })).toBeVisible();
  await expect(page.getByLabel("Limite de estoque baixo")).toHaveCount(0);
  const account = { id: 2, name: "Cliente", email: "customer@example.test", role: "USER" };
  await page.route("**/api/auth/me", route => route.fulfill({ json: { account } }));
  await page.route("**/api/auth/login", route => route.fulfill({ json: { account, accessToken: "user-test", tokenType: "Bearer", expiresIn: 3600, expiresAt: Date.now() + 3600000 } }));
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.getByLabel("E-mail", { exact: true }).fill(account.email);
  await page.getByLabel("Senha", { exact: true }).fill("test-password");
  await page.locator('form button[type="submit"]').click();
  await expect(page.getByRole("heading", { name: "Acesso restrito" })).toBeVisible();
  await expect(page.getByLabel("Limite de estoque baixo")).toHaveCount(0);
});

for (const width of [1440, 390, 320]) test(`store details save and feed public contact at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await setup(page);
  let details: any = { address: null, whatsapp: null };
  let writes = 0;
  let fail = false;
  await page.route("**/api/settings/store", async route => {
    if (route.request().method() === "PUT") {
      writes++;
      if (fail) return route.fulfill({ status: 500, json: { error: "Falha ao salvar dados da loja" } });
      const body = route.request().postDataJSON();
      details = { ...body, address: { ...body.address, cep: "80000000" }, whatsapp: "5541999999999" };
    }
    return route.fulfill({ json: details });
  });
  await page.route("**/api/settings/public", route => route.fulfill({ json: details }));
  await page.route("https://viacep.com.br/**", route => route.fulfill({ json: { logradouro: "Rua Teste", bairro: "Centro", localidade: "Curitiba", uf: "PR" } }));
  await page.getByRole("link", { name: "Configurações", exact: true }).click();
  await expect(page.getByLabel("CEP", { exact: true })).toBeVisible();
  await page.getByLabel("CEP", { exact: true }).fill("80000000");
  await expect(page.getByLabel("Rua / Logradouro")).toHaveValue("Rua Teste");
  await page.getByLabel("Número", { exact: true }).fill("123");
  await page.getByLabel("Complemento (opcional)").fill("Sala 2");
  await page.getByLabel("Telefone / WhatsApp").fill("(41) 99999-9999");
  fail = true;
  await page.getByRole("button", { name: "Salvar dados da loja", exact: true }).click();
  await expect(page.locator('[data-sonner-toast][data-type="error"]')).toContainText("Falha ao salvar");
  await page.locator('[data-sonner-toast][data-type="error"]').getByRole("button", { name: "Fechar notificação" }).click();
  await expect(page.locator('[data-sonner-toast][data-type="error"]')).toHaveCount(0);
  await expect(page.getByLabel("Número", { exact: true })).toHaveValue("123");
  fail = false;
  await page.getByRole("button", { name: "Salvar dados da loja", exact: true }).click();
  await expectSuccess(page, "Dados da loja salvos com sucesso!", "positive");
  expect(writes).toBe(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.reload();
  await expect(page.getByLabel("Número", { exact: true })).toHaveValue("123");
  await page.getByRole("link", { name: "Ver loja", exact: true }).click();
  await expect(page.locator("footer address")).toContainText("Rua Teste, 123 · Sala 2");
  await expect(page.locator("footer address")).toContainText("CEP 80000-000");
  await expect(page.locator("footer")).toContainText("(41) 99999-9999");
  await expect(page.getByRole("link", { name: "Falar conosco pelo WhatsApp" })).toHaveAttribute("href", "https://wa.me/5541999999999");
  await expect(page.locator("footer")).not.toContainText("9745-8063");
  details = { address: null, whatsapp: null };
  await page.reload();
  await expect(page.locator("footer")).toContainText("Endereço da loja ainda não informado.");
  await expect(page.locator("footer address")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Falar conosco pelo WhatsApp" })).toHaveCount(0);
  await page.route("**/api/settings/public", route => route.fulfill({ status: 500, json: { error: "Indisponível" } }));
  await page.reload();
  await expect(page.getByRole("link", { name: "Falar conosco pelo WhatsApp" })).toHaveCount(0);
});

test("store details prevent repeated submits while saving", async ({ page }) => {
  await setup(page);
  await page.getByRole("link", { name: "Configurações", exact: true }).click();
  await expect(page.getByLabel("Telefone / WhatsApp")).toBeVisible();
  await page.getByLabel("Telefone / WhatsApp").fill("(41) 99999-9999");
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let calls = 0;
  await page.route("**/api/settings/store", async route => {
    if (route.request().method() !== "PUT") return route.fallback();
    calls++; await gate;
    return route.fulfill({ json: { address: null, whatsapp: "5541999999999" } });
  });
  await page.getByRole("button", { name: "Salvar dados da loja", exact: true }).click();
  await expect(page.getByRole("button", { name: "Salvando dados da loja..." })).toBeDisabled();
  await page.getByRole("heading", { name: "Dados da loja", exact: true }).locator("..").locator("form").evaluate(form => {
    (form as HTMLFormElement).requestSubmit(); (form as HTMLFormElement).requestSubmit();
  });
  expect(calls).toBe(1);
  release();
  await expectSuccess(page, "Dados da loja salvos com sucesso!", "positive");
});
