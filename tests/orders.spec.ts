import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
const tag = `order-browser-${randomUUID()}`;
let fixture: { orders: { id: number; number: string; sequence: number }[]; productId: number; variantId: number };
const run = (action: string, fixtureTag = tag) => execFileSync(process.execPath, ["--import", "tsx", "tests/helpers/orders-browser-fixture.ts", action, fixtureTag], { cwd: "backend", env: process.env, windowsHide: true, encoding: "utf8" });
test.beforeAll(() => { fixture = JSON.parse(run("create")); });
test.afterAll(() => { run("delete"); });
async function admin(page: Page) {
  const response = await page.request.post("/api/auth/login", { data: { email: process.env.E2E_ADMIN_EMAIL, password: process.env.E2E_ADMIN_PASSWORD } });
  const session = await response.json();
  await page.addInitScript(session => localStorage.setItem("mcd-store_auth_v1", JSON.stringify({ accessToken: session.accessToken, expiresAt: session.expiresAt })), session);
  await page.goto("/manager");
  await page.getByRole("link", { name: "Pedidos", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Pedidos", exact: true })).toBeVisible();
  await page.getByLabel("Pesquisar pedidos").fill(tag);
  await expect(page.locator('section[aria-label="Lista de pedidos"] article')).toHaveCount(20);
  await expect(page.getByText("25 pedidos", { exact: true }).first()).toBeVisible();
  return session.accessToken as string;
}
const rows = (page: Page) => page.locator('section[aria-label="Lista de pedidos"] article');
async function search(page: Page, text: string, count: number) {
  await page.getByLabel("Pesquisar pedidos").fill(text); await expect(rows(page)).toHaveCount(count);
}
async function details(page: Page, index: number) {
  await search(page, fixture.orders[index].number, 1);
  await rows(page).getByRole("button", { name: /Ver detalhes/ }).click();
  const dialog = page.getByRole("dialog"); await expect(dialog.getByRole("heading", { name: `Pedido #${fixture.orders[index].number}`, exact: true })).toBeVisible();
  return dialog;
}
test("navigation, combined search/status, number/date arrows and pagination", async ({ page }) => {
  await admin(page);
  await expect(rows(page).first()).toContainText(fixture.orders[0].number);
  await page.getByRole("button", { name: "Próxima página", exact: true }).first().click();
  await expect(page.getByText("Página 2 de 2", { exact: true })).toBeVisible(); await expect(rows(page)).toHaveCount(5);
  await search(page, `mArIa ${tag}`, 12); await expect(page.getByText("Página 1 de 1", { exact: true })).toBeVisible();
  await page.getByLabel("Status", { exact: true }).selectOption("PREPARING"); await expect(rows(page)).toHaveCount(2);
  await expect(rows(page).first()).toContainText("Em preparação");
  await page.getByLabel("Status", { exact: true }).selectOption(""); await search(page, tag, 20);
  await page.getByRole("button", { name: /Ordenar por número/ }).click(); await expect(rows(page).first()).toContainText(fixture.orders[0].number);
  await page.getByRole("button", { name: /Ordenar por número/ }).click(); await expect(rows(page).first()).toContainText(fixture.orders[24].number);
  await page.getByRole("button", { name: /Ordenar por data/ }).click(); await expect(rows(page).first()).toContainText(fixture.orders[24].number);
  await page.getByRole("button", { name: /Ordenar por data/ }).click(); await expect(rows(page).first()).toContainText(fixture.orders[0].number);
  for (const status of ["PENDING_CONFIRMATION", "PREPARING", "READY_OR_SHIPPED", "COMPLETED", "CANCELLED"]) {
    await page.getByLabel("Status", { exact: true }).selectOption(status);
    await expect(rows(page).first()).toBeVisible();
  }
  await search(page, "no-such-customer-xyz", 0); await expect(page.getByText("Nenhum pedido corresponde aos filtros selecionados.")).toBeVisible();
});

test("dashboard shows real status counts and supports status-filtered operational orders", async ({ page }) => {
  await admin(page);
  await page.goto("/manager");
  await expect(page.getByRole("heading", { name: "Pedidos por status" })).toBeVisible();
  const selector = page.getByLabel("Filtrar pedidos por status");
  await expect(selector.locator("option")).toHaveText(["Todos", "Aguardando confirmação", "Em preparação", "Pronto ou enviado", "Finalizado", "Cancelado"]);
  for (const label of ["Aguardando confirmação", "Em preparação", "Pronto ou enviado", "Finalizado", "Cancelado"])
    await expect(page.getByRole("link", { name: `Ver pedidos: ${label}` })).toBeVisible();
  await selector.selectOption("COMPLETED");
  await expect(page.locator("section[aria-labelledby='order-status-title'] article").first()).toContainText("Finalizado");
  await selector.selectOption("");
  await expect(page.getByRole("link", { name: "Abrir pedidos" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("closing archive and cancellation dialogs resets the next order action", async ({ page }) => {
  await admin(page);
  let dialog = await details(page, 5);
  await dialog.getByRole("button", { name: "Arquivar pedido", exact: true }).click();
  let confirmation = page.getByRole("alertdialog");
  await expect(confirmation.getByRole("heading")).toContainText("Arquivar o pedido");
  await confirmation.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(confirmation).toHaveCount(0);

  await dialog.getByRole("button", { name: "Cancelar pedido", exact: true }).click();
  confirmation = page.getByRole("alertdialog");
  await expect(confirmation.getByRole("heading")).toContainText("Cancelar o pedido");
  await confirmation.getByRole("button", { name: "Voltar", exact: true }).click();
  await expect(confirmation).toHaveCount(0);

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  dialog = await details(page, 5);
  await dialog.getByRole("button", { name: "Confirmar pedido", exact: true }).click();
  confirmation = page.getByRole("alertdialog");
  await expect(confirmation.getByRole("heading")).toContainText("Confirmar o pedido");
  await expect(confirmation).toContainText("estoque das variantes deste pedido será reduzido");
  await confirmation.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(dialog).toContainText("Aguardando confirmação");
});

test("reports page defaults to six months grouped by week and keeps filters in the URL", async ({ page }) => {
  await admin(page);
  await page.getByRole("link", { name: "Relatórios" }).click();
  await expect(page.getByRole("heading", { name: "Relatórios", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "6 meses" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("heading", { name: "Faturamento semanal" })).toBeVisible();
  await page.getByRole("button", { name: "Mensal" }).click();
  await expect(page).toHaveURL(/agrupar=mensal/);
  await expect(page.getByRole("heading", { name: "Faturamento mensal" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Diário" })).toHaveAttribute("aria-disabled", "true");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test("historical DELIVERY/PICKUP details, confirmation dialog, repeated submit protection and success", async ({ page }) => {
  const token = await admin(page);
  let dialog = await details(page, 1);
  await expect(dialog).toContainText("Retirada na loja"); await expect(dialog).toContainText("Loja Histórica, 456");
  await expect(dialog).not.toContainText("Rua Histórica"); await page.keyboard.press("Escape");
  await page.getByLabel("Status", { exact: true }).selectOption("PENDING_CONFIRMATION");
  dialog = await details(page, 0);
  await expect(dialog).toContainText("Rua Histórica, 123"); await expect(dialog).not.toContainText("Rua Atual Diferente");
  await expect(dialog).toContainText("2x Camiseta Histórica"); await expect(dialog).toContainText("Unitário: R$ 129,00");
  await dialog.getByRole("button", { name: "Confirmar pedido", exact: true }).click();
  const alert = page.getByRole("alertdialog"); await expect(alert).toContainText("o estoque das variantes deste pedido será reduzido");
  await alert.getByRole("button", { name: "Cancelar", exact: true }).click(); await expect(dialog).toContainText("Aguardando confirmação");
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; }); let requests = 0;
  await page.route(`**/api/orders/${fixture.orders[0].id}/confirm`, async route => { requests++; await gate; await route.continue(); });
  await dialog.getByRole("button", { name: "Confirmar pedido", exact: true }).click();
  await alert.getByRole("button", { name: "Confirmar pedido", exact: true }).click();
  const button = alert.getByRole("button", { name: "Confirmando...", exact: true }); await expect(button).toBeDisabled();
  await button.evaluate(element => { (element as HTMLButtonElement).click(); (element as HTMLButtonElement).click(); });
  expect(requests).toBe(1); release();
  await expect(dialog).toContainText("Em preparação"); await expect(dialog.getByRole("button", { name: "Confirmar pedido", exact: true })).toHaveCount(0);
  await expect(page.locator('[data-sonner-toast][data-type="success"]')).toContainText("Pedido confirmado com sucesso!");
  await page.keyboard.press("Escape"); await expect(rows(page)).toHaveCount(0);
  await expect(page.getByText("Nenhum pedido corresponde aos filtros selecionados.")).toBeVisible();
  await page.getByLabel("Status", { exact: true }).selectOption("PREPARING");
  await expect(rows(page)).toContainText("Em preparação");
  const product = (await (await page.request.get("/api/produtos")).json()).find((p: any) => p.id === fixture.productId);
  expect(product.colors[0].variants.find((v: any) => v.id === fixture.variantId).stock).toBe(98);
  expect((await page.request.post(`/api/orders/${fixture.orders[0].id}/confirm`, { headers: { Authorization: `Bearer ${token}` }, data: {} })).status()).toBe(409);
});
test("stock conflicts keep pending status and show all useful fields", async ({ page }) => {
  await admin(page); const dialog = await details(page, 2);
  await dialog.getByRole("button", { name: "Confirmar pedido", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Confirmar pedido", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Estoque insuficiente");
  for (const text of ["Camiseta Histórica", "Cor: Branco", "Tamanho: P", "Solicitado: 2", "Disponível: 0"]) await expect(dialog.getByRole("alert")).toContainText(text);
  await expect(dialog.getByRole("alert")).toContainText("Segundo Item Histórico");
  await expect(dialog.getByRole("alert")).toContainText("Disponível: 1");
  await expect(dialog).toContainText("Aguardando confirmação"); await expect(dialog.getByRole("button", { name: "Confirmar pedido", exact: true })).toBeEnabled();
});
for (const width of [1440, 768, 390, 320]) test(`order list and details fit ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 900 }); await admin(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const dialog = await details(page, 1); await expect(dialog).toContainText("Loja Histórica");
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await expect(dialog).toHaveCSS("opacity", "1");
  await page.screenshot({ path: info.outputPath(`orders-${width}.png`), fullPage: true });
  await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0);
  await expect(rows(page).getByRole("button", { name: /Ver detalhes/ })).toBeFocused();
});
test("search debounce avoids per-keystroke requests and discards stale responses", async ({ page }) => {
  await admin(page);
  let requests = 0;
  await page.route("**/api/orders?**", async route => { requests++; await route.continue(); });
  const response = page.waitForResponse(response => response.url().includes("/api/orders?") && response.url().includes("search=Maria"));
  await page.getByLabel("Pesquisar pedidos").fill("");
  await page.getByLabel("Pesquisar pedidos").pressSequentially("Maria", { delay: 15 });
  await response; await expect(rows(page)).toHaveCount(12); expect(requests).toBe(1);
  await page.unroute("**/api/orders?**");
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  let reached!: () => void; const started = new Promise<void>(resolve => { reached = resolve; });
  await page.route("**/api/orders?**", async route => {
    if (new URL(route.request().url()).searchParams.get("search") === "stale") {
      reached(); await gate; await route.fulfill({ json: { items: [], total: 0, page: 1, pageSize: 20, totalPages: 1 } });
    } else await route.continue();
  });
  try {
    await page.getByLabel("Pesquisar pedidos").fill("stale"); await started;
    await search(page, fixture.orders[9].number, 1); await expect(rows(page)).toContainText(fixture.orders[9].number);
  } finally { release(); }
  await expect(rows(page)).toContainText(fixture.orders[9].number);
});
test("list/detail failures allow retry, empty state, loading and forbidden USER", async ({ page }) => {
  await admin(page);
  await page.route("**/api/orders?**", route => route.fulfill({ status: 500, json: { error: "Falha temporária nos pedidos." } }));
  await search(page, "trigger-failure", 0); await expect(page.getByRole("alert")).toContainText("Falha temporária nos pedidos.");
  await page.unroute("**/api/orders?**"); await page.getByRole("button", { name: "Tentar novamente", exact: true }).click();
  await expect(page.getByText("Nenhum pedido corresponde aos filtros selecionados.")).toBeVisible();
  await search(page, fixture.orders[1].number, 1);
  await page.route(`**/api/orders/${fixture.orders[1].id}`, route => route.fulfill({ status: 500, json: { error: "Falha nos detalhes." } }));
  await rows(page).getByRole("button", { name: /Ver detalhes/ }).click(); await expect(page.getByRole("dialog").getByRole("alert")).toContainText("Falha nos detalhes.");
  await page.unroute(`**/api/orders/${fixture.orders[1].id}`); await page.getByRole("button", { name: "Tentar carregar detalhes novamente" }).click();
  await expect(page.getByRole("dialog")).toContainText("Loja Histórica"); await page.keyboard.press("Escape");
  await page.route("**/api/orders?**", route => route.fulfill({ json: { items: [], total: 0, page: 1, pageSize: 20, totalPages: 1 } }));
  await search(page, "", 0); await expect(page.getByText("Nenhum pedido encontrado.")).toBeVisible();
  const session = await (await page.request.post("/api/auth/login", { data: { email: process.env.E2E_USER_EMAIL, password: process.env.E2E_USER_PASSWORD } })).json();
  const userPage = await page.context().newPage();
  await userPage.addInitScript(session => localStorage.setItem("mcd-store_auth_v1", JSON.stringify({ accessToken: session.accessToken, expiresAt: session.expiresAt })), session);
  await userPage.goto("/manager/pedidos"); await expect(userPage.getByRole("heading", { name: "Acesso restrito" })).toBeVisible();
  await expect(userPage.getByRole("navigation", { name: "Navegação administrativa" })).toHaveCount(0);
});

for (const width of [320, 390, 768, 1440]) test(`normal order cycle and confirmation fit ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 }); await admin(page);
  for (const [index, method] of [[16, "DELIVERY"], [21, "PICKUP"]] as const) {
    const id = fixture.orders[index].id;
    const preparing = { id, number: fixture.orders[index].number, status: "PREPARING", fulfillmentMethod: method };
    let current: any;
    await page.route(`**/api/orders/${id}`, async route => {
      if (!current) { const response = await route.fetch(); current = { ...await response.json(), ...preparing }; }
      await route.fulfill({ json: current });
    });
    let release!: () => void; let gate = new Promise<void>(resolve => { release = resolve; }); let requests = 0;
    await page.route(`**/api/orders/${id}/advance`, async route => {
      requests++; expect(route.request().postDataJSON()).toEqual({ expectedStatus: current.status });
      await gate; current = { ...current, status: current.status === "PREPARING" ? "READY_OR_SHIPPED" : "COMPLETED" };
      await route.fulfill({ json: current });
    });
    const dialog = await details(page, index);
    const label = method === "DELIVERY" ? "Marcar como enviado" : "Marcar como pronto para retirada";
    await dialog.getByRole("button", { name: label, exact: true }).click();
    const alert = page.getByRole("alertdialog");
    await expect(alert).toContainText(`Marcar o pedido #${preparing.number} como ${method === "DELIVERY" ? "enviado" : "pronto para retirada"}?`);
    expect(requests).toBe(0);
    expect(await alert.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await alert.getByRole("button", { name: "Cancelar", exact: true }).click(); expect(requests).toBe(0);
    await dialog.getByRole("button", { name: label, exact: true }).click();
    await alert.getByRole("button", { name: label, exact: true }).click();
    const updating = alert.getByRole("button", { name: "Atualizando...", exact: true }); await expect(updating).toBeDisabled();
    await updating.evaluate(el => { (el as HTMLButtonElement).click(); (el as HTMLButtonElement).click(); });
    release();
    await expect(dialog.getByText(method === "DELIVERY" ? "Enviado" : "Pronto para retirada", { exact: true })).toBeVisible();
    expect(requests).toBe(1); expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await dialog.getByRole("button", { name: "Finalizar pedido", exact: true }).click();
    await expect(alert).toContainText(`Finalizar o pedido #${preparing.number}?`);
    await alert.getByRole("button", { name: "Finalizar pedido", exact: true }).click();
    await expect(dialog.getByText("Finalizado", { exact: true })).toBeVisible();
    await expect(dialog.getByRole("button", { name: /Marcar como|Finalizar pedido|Confirmar pedido/ })).toHaveCount(0);
    await page.keyboard.press("Escape");
  }
  const cancelled = await details(page, 4);
  await expect(cancelled).toContainText("Cancelado");
  await expect(cancelled.getByRole("button", { name: /Marcar como|Finalizar pedido|Confirmar pedido/ })).toHaveCount(0);
});

test("real advance respects active filters and stale ADMIN state recovers", async ({ page }) => {
  const token = await admin(page); const index = 6, id = fixture.orders[index].id;
  await page.getByLabel("Status", { exact: true }).selectOption("PREPARING");
  await page.getByRole("button", { name: /Ordenar por número/ }).click();
  const dialog = await details(page, index);
  const calls: string[] = [];
  await page.route("**/api/orders?**", async route => { calls.push(route.request().url()); await route.continue(); });
  await dialog.getByRole("button", { name: "Marcar como enviado", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Marcar como enviado", exact: true }).click();
  await expect(dialog.getByText("Enviado", { exact: true })).toBeVisible();
  await expect(rows(page)).toHaveCount(0);
  expect(calls.some(url => { const q = new URL(url).searchParams; return q.get("status") === "PREPARING" && q.get("search") === fixture.orders[index].number && q.get("sort") === "number" && q.get("direction") === "asc"; })).toBe(true);
  expect((await page.request.post(`/api/orders/${id}/advance`, { headers: { Authorization: `Bearer ${token}` }, data: { expectedStatus: "READY_OR_SHIPPED" } })).status()).toBe(200);
  await dialog.getByRole("button", { name: "Finalizar pedido", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Finalizar pedido", exact: true }).click();
  await expect(dialog).toContainText("Finalizado"); await expect(dialog.getByRole("alert")).toContainText("status do pedido mudou");
  await expect(dialog.getByRole("button", { name: "Finalizar pedido", exact: true })).toHaveCount(0);
});

for (const width of [320, 390, 768, 1440]) test(`real cancellation, stock and accessible dialog fit ${width}px`, async ({ page }, info) => {
  test.setTimeout(90000);
  const fixtureTag = `order-browser-${randomUUID()}`;
  const data: typeof fixture = JSON.parse(run("create-cancel", fixtureTag));
  try {
    await page.setViewportSize({ width, height: 900 }); const token = await admin(page);
    const headers = { Authorization: `Bearer ${token}` };
    const stock = async () => {
      const product = (await (await page.request.get("/api/produtos")).json()).find((p: any) => p.id === data.productId);
      return product.colors[0].variants.find((v: any) => v.id === data.variantId).stock;
    };
    const post = (id: number, action: string, body: unknown) => page.request.post(`/api/orders/${id}/${action}`, { headers, data: body });
    await page.getByRole("button", { name: /Ordenar por número/ }).click();
    for (const [index, status] of [[0, "PENDING_CONFIRMATION"], [1, "PENDING_CONFIRMATION"], [5, "PREPARING"], [10, "PREPARING"], [15, "READY_OR_SHIPPED"], [20, "READY_OR_SHIPPED"]] as const) {
      const order = data.orders[index];
      if (status !== "PENDING_CONFIRMATION") expect((await post(order.id, "confirm", {})).status()).toBe(200);
      if (status === "READY_OR_SHIPPED") expect((await post(order.id, "advance", { expectedStatus: "PREPARING" })).status()).toBe(200);
      expect(await stock()).toBe(status === "PENDING_CONFIRMATION" ? 100 : 98);
      await page.getByLabel("Status", { exact: true }).selectOption(status);
      await search(page, order.number, 1);
      await rows(page).getByRole("button", { name: /Ver detalhes/ }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toContainText(index % 2 ? "Retirada na loja" : "Entrega");
      const trigger = dialog.getByRole("button", { name: "Cancelar pedido", exact: true }); await expect(trigger).toBeVisible();
      await trigger.click(); const alert = page.getByRole("alertdialog");
      await expect(alert.getByRole("heading")).toHaveText(`Cancelar o pedido #${order.number}?`);
      await expect(alert).toContainText(status === "PENDING_CONFIRMATION" ? "não houve baixa de estoque" : "O estoque deste pedido será devolvido.");
      await expect(alert).toHaveCSS("opacity", "1");
      expect(await alert.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`cancel-${width}-${status}-${index}.png`), fullPage: true });
      await alert.getByRole("button", { name: "Voltar", exact: true }).click(); await expect(trigger).toBeFocused();
      expect((await (await page.request.get(`/api/orders/${order.id}`, { headers })).json()).status).toBe(status);
      let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; }); let requests = 0;
      await page.route(`**/api/orders/${order.id}/cancel`, async route => {
        requests++; expect(route.request().postDataJSON()).toEqual({ expectedStatus: status }); await gate; await route.continue();
      });
      const listQueries: URLSearchParams[] = [];
      const capture = (request: any) => { if (request.url().includes("/api/orders?")) listQueries.push(new URL(request.url()).searchParams); };
      page.on("request", capture);
      await trigger.click(); await alert.getByRole("button", { name: "Cancelar pedido", exact: true }).click();
      const submitting = alert.getByRole("button", { name: "Cancelando...", exact: true }); await expect(submitting).toBeDisabled();
      await expect(alert.getByRole("button", { name: "Voltar", exact: true })).toBeDisabled();
      await submitting.evaluate(el => { (el as HTMLButtonElement).click(); (el as HTMLButtonElement).click(); });
      await page.keyboard.press("Escape"); await expect(alert).toBeVisible(); release();
      await expect(dialog.getByText("Cancelado", { exact: true })).toBeVisible(); expect(requests).toBe(1);
      await expect(alert).toHaveCount(0); await expect(dialog.getByRole("button", { name: "Cancelar pedido", exact: true })).toHaveCount(0);
      await expect(page.locator('[data-sonner-toast][data-type="success"]').last()).toContainText("Pedido cancelado com sucesso!");
      await expect(rows(page)).toHaveCount(0); expect(await stock()).toBe(100);
      expect(listQueries.some(q => q.get("search") === order.number && q.get("status") === status && q.get("sort") === "number" && q.get("direction") === "asc" && q.get("page") === "1")).toBe(true);
      page.off("request", capture); await page.unroute(`**/api/orders/${order.id}/cancel`);
      expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
      await page.keyboard.press("Escape");
      await page.getByLabel("Status", { exact: true }).selectOption("CANCELLED");
      await expect(rows(page)).toHaveCount(1); await expect(rows(page)).toContainText("Cancelado");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    for (const index of [3, 4]) {
      await page.getByLabel("Status", { exact: true }).selectOption(""); await search(page, data.orders[index].number, 1);
      await rows(page).getByRole("button", { name: /Ver detalhes/ }).click(); const dialog = page.getByRole("dialog");
      await expect(dialog).toContainText(index === 3 ? "Finalizado" : "Cancelado");
      await expect(dialog.getByRole("button", { name: /Cancelar pedido|Confirmar pedido|Marcar como|Finalizar pedido/ })).toHaveCount(0);
      await page.keyboard.press("Escape");
    }
  } finally { run("delete", fixtureTag); }
});

test("cancellation conflict rereads another ADMIN's status and keeps useful errors", async ({ page }) => {
  const fixtureTag = `order-browser-${randomUUID()}`;
  const data: typeof fixture = JSON.parse(run("create-cancel", fixtureTag));
  try {
    const token = await admin(page), order = data.orders[0], headers = { Authorization: `Bearer ${token}` };
    expect((await page.request.post(`/api/orders/${order.id}/confirm`, { headers, data: {} })).status()).toBe(200);
    await search(page, order.number, 1); await rows(page).getByRole("button", { name: /Ver detalhes/ }).click();
    const dialog = page.getByRole("dialog"); await expect(dialog).toContainText("Em preparação");
    await dialog.getByRole("button", { name: "Cancelar pedido", exact: true }).click();
    expect((await page.request.post(`/api/orders/${order.id}/advance`, { headers, data: { expectedStatus: "PREPARING" } })).status()).toBe(200);
    await page.getByRole("alertdialog").getByRole("button", { name: "Cancelar pedido", exact: true }).click();
    await expect(dialog.getByRole("alert")).toContainText("status do pedido mudou"); await expect(dialog.getByText("Enviado", { exact: true })).toBeVisible();
    await expect(rows(page)).toContainText("Enviado");
    await dialog.getByRole("button", { name: "Cancelar pedido", exact: true }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Cancelar pedido", exact: true }).click();
    await expect(dialog.getByText("Cancelado", { exact: true })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Cancelar pedido", exact: true })).toHaveCount(0);
  } finally { run("delete", fixtureTag); }
});
