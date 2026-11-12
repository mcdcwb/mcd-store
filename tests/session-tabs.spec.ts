import { test, expect, type Page } from "@playwright/test";

test.use({ viewport: { width: 1440, height: 1100 } });

const authKey = "mcd-store_auth_v1";
let product: any;
let adminHeaders: { Authorization: string };
const accounts = {
  user: { email: process.env.E2E_USER_EMAIL!, password: process.env.E2E_USER_PASSWORD!, name: "Cliente" },
  other: { email: `${process.env.E2E_PROFILE_PREFIX}-lookup@example.test`, password: process.env.E2E_USER_PASSWORD!, name: "Nome" },
  admin: { email: process.env.E2E_ADMIN_EMAIL!, password: process.env.E2E_ADMIN_PASSWORD!, name: process.env.E2E_ADMIN_EMAIL!.split("@")[0] }
};
const card = (page: Page) => page.locator("main div.group").filter({ has: page.getByText("Session Tabs Product", { exact: true }) });
async function settled(page: Page) {
  await expect(page.getByText("Sincronizando favoritos e carrinho...")).toHaveCount(0);
}
async function login(page: Page, kind: keyof typeof accounts) {
  const account = accounts[kind];
  await page.getByRole("button", { name: "Entrar", exact: true }).first().click();
  await page.getByLabel("E-mail", { exact: true }).fill(account.email);
  await page.getByLabel("Senha", { exact: true }).fill(account.password);
  await page.locator('form button[type="submit"]').click();
  if (kind === "admin") await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
  else await expect(page.getByRole("button", { name: account.name, exact: true })).toBeVisible();
  await settled(page);
}
async function logout(page: Page, kind: keyof typeof accounts) {
  await page.getByRole("button", { name: accounts[kind].name, exact: true }).click();
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await expect(page.getByRole("button", { name: "Entrar", exact: true }).first()).toBeVisible();
}
async function add(page: Page) {
  await card(page).getByRole("button", { name: "M", exact: true }).click();
  await card(page).getByRole("button", { name: "Adicionar ao carrinho", exact: true }).click();
  await settled(page);
}
async function cartCount(page: Page, count: number) {
  await page.getByRole("button", { name: "Abrir carrinho" }).click();
  await expect(page.getByRole("button", { name: "Remover item", exact: true })).toHaveCount(count);
  await page.getByRole("button", { name: "Fechar carrinho" }).click();
}
// Rola o card para abaixo do header fixo e favorita. Repete enquanto o layout ainda se acomoda (um aviso que some
// acima do card pode levá-lo para baixo do header); uma tentativa que expira não chega a clicar.
async function favoriteFromCard(page: Page) {
  await expect(async () => {
    await card(page).evaluate(element => window.scrollTo(0, window.scrollY + element.getBoundingClientRect().top - 120));
    await card(page).getByRole("img").hover();
    await card(page).getByRole("button", { name: "Favoritar", exact: true }).click({ timeout: 2000 });
  }).toPass();
}
async function openProduct(page: Page) {
  // O produto abre na mesma aba; a outra aba real vem do Ctrl/Cmd+clique no mesmo link.
  const opened = page.context().waitForEvent("page");
  await card(page).locator('a[href*="productId="]').click({ modifiers: ["ControlOrMeta"] });
  const tab = await opened;
  await tab.waitForLoadState();
  await expect(tab).toHaveURL(/productId=/);
  return tab;
}

test.beforeAll(async ({ request }) => {
  const response = await request.post("/api/auth/login", { data: accounts.admin });
  adminHeaders = { Authorization: `Bearer ${(await response.json()).accessToken}` };
  const created = await request.post("/api/produtos", {
    headers: adminHeaders, data: {
      name: "Session Tabs Product", price: 31, public: "unissex", categoryId: (await (await request.get("/api/categorias", { headers: adminHeaders })).json()).find((c: { name: string }) => c.name === "camisetas").id,
      colors: [{ colorName: "Preto", colorValue: "#111111", images: [], variants: [{ value: "M", stock: 10 }] }]
    }
  });
  expect(created.status()).toBe(201);
  product = await created.json();
});
test.afterAll(async ({ request }) => {
  if (product) await request.delete(`/api/produtos/${product.id}`, { headers: adminHeaders });
});
test.beforeEach(async ({ request }) => {
  for (const kind of ["user", "other"] as const) {
    const response = await request.post("/api/auth/login", { data: accounts[kind] });
    const headers = { Authorization: `Bearer ${(await response.json()).accessToken}` };
    await request.delete("/api/carrinho", { headers });
    await request.delete(`/api/favoritos/${product.id}`, { headers });
  }
});

test("USER opens real product tab, refreshes, shares mutations and logs out everywhere", async ({ page, context }) => {
  await page.goto("/"); await login(page, "user"); await add(page);
  await favoriteFromCard(page); await settled(page);
  const tab = await openProduct(page);
  await expect(tab.getByRole("button", { name: "Cliente", exact: true })).toBeVisible();
  await settled(tab); await cartCount(tab, 1);
  await tab.reload(); await expect(tab.getByRole("button", { name: "Cliente", exact: true })).toBeVisible();
  await tab.goto("/");
  await expect(card(tab).getByRole("button", { name: "Remover dos favoritos" })).toBeVisible();
  await card(tab).getByRole("button", { name: "Remover dos favoritos" }).click();
  await expect(card(page).getByRole("button", { name: "Favoritar", exact: true })).toBeVisible();
  await logout(page, "user");
  await expect(tab.getByRole("button", { name: "Entrar", exact: true }).first()).toBeVisible();
  await cartCount(tab, 0); await tab.reload();
  await expect(tab.getByRole("button", { name: "Entrar", exact: true }).first()).toBeVisible();
  const fresh = await context.newPage(); await fresh.goto("/");
  await expect(fresh.getByRole("button", { name: "Entrar", exact: true }).first()).toBeVisible();
  expect(await fresh.evaluate(key => localStorage.getItem(key) === null && sessionStorage.getItem(key) === null, authKey)).toBe(true);
});

test("ADMIN product tab retains identity and Manager; local cart cannot become USER or guest cart", async ({ page }) => {
  await page.goto("/"); await login(page, "admin"); await page.goto("/"); await add(page); await cartCount(page, 1);
  const tab = await openProduct(page);
  await expect(tab.getByRole("button", { name: accounts.admin.name, exact: true })).toBeVisible();
  await cartCount(tab, 0);
  await tab.goto("/manager"); await expect(tab).toHaveURL(/\/manager/);
  await expect(tab.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
  await tab.reload(); await expect(tab.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
  await logout(page, "admin"); await login(page, "user");
  // Cliente: painel em modo leitura (modo demonstração), com a faixa, sem trocar de conta.
  await expect(tab.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
  await expect(tab.getByRole("note").filter({ hasText: "Modo demonstração — explore à vontade, as alterações não são salvas." })).toBeVisible();
  await cartCount(page, 0);
  await tab.goto("/"); await settled(tab); await cartCount(tab, 0);
  await expect(card(tab).getByRole("button", { name: "Favoritar", exact: true })).toBeVisible();
});

test("guest merge remains idempotent across tabs and USER A cannot leak into USER B", async ({ page, context }) => {
  await page.goto("/"); await add(page);
  const tab = await context.newPage(); await tab.goto("/"); await cartCount(tab, 1);
  await login(page, "user");
  await expect(tab.getByRole("button", { name: "Cliente", exact: true })).toBeVisible();
  await settled(tab); await cartCount(tab, 1);
  await favoriteFromCard(page); await settled(page);
  await logout(tab, "user"); await login(tab, "other");
  await expect(page.getByRole("button", { name: "Nome", exact: true })).toBeVisible();
  await settled(page); await cartCount(page, 0); await cartCount(tab, 0);
  await expect(card(page).getByRole("button", { name: "Favoritar", exact: true })).toBeVisible();
  await logout(tab, "other"); await login(tab, "user"); await settled(tab); await cartCount(tab, 1);
  await expect(card(tab).getByRole("button", { name: "Remover dos favoritos" })).toBeVisible();
});

test("invalid credential is rejected by real /auth/me in all tabs", async ({ page, context }) => {
  await page.goto("/"); await login(page, "user");
  const tab = await context.newPage(); await tab.goto("/");
  await expect(tab.getByRole("button", { name: "Cliente", exact: true })).toBeVisible();
  await page.evaluate(key => localStorage.setItem(key, JSON.stringify({ accessToken: "invalid-test-credential", expiresAt: Date.now() + 60000 })), authKey);
  await expect(tab.getByRole("button", { name: "Entrar", exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Entrar", exact: true }).first()).toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key) === null, authKey)).toBe(true);
});

test("late /auth/me success cannot restore a session logged out in another tab", async ({ page, context }) => {
  await page.goto("/"); await login(page, "user");
  const tab = await context.newPage(); await tab.goto("/");
  await expect(tab.getByRole("button", { name: "Cliente", exact: true })).toBeVisible();
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  let started!: () => void; const requestStarted = new Promise<void>(resolve => { started = resolve; });
  await tab.route("**/api/auth/me", async route => { const response = await route.fetch(); started(); await gate; await route.fulfill({ response }); });
  await tab.evaluate(() => window.dispatchEvent(new Event("focus"))); await requestStarted;
  await logout(page, "user"); release();
  await expect(tab.getByRole("button", { name: "Entrar", exact: true }).first()).toBeVisible();
  await tab.reload(); await expect(tab.getByRole("button", { name: "Entrar", exact: true }).first()).toBeVisible();
});

test("failed guest import remains claimed by USER A after account switch", async ({ page }) => {
  await page.goto("/"); await add(page);
  await page.route("**/api/carrinho/sincronizar", route => route.fulfill({ status: 503, json: { error: "Merge temporarily unavailable" } }));
  await login(page, "user"); await expect(page.getByRole("alert")).toContainText("Merge temporarily unavailable");
  await logout(page, "user"); await login(page, "other"); await cartCount(page, 0);
  await page.unroute("**/api/carrinho/sincronizar");
  await logout(page, "other"); await login(page, "user"); await cartCount(page, 1);
});

test("late cart and favorites responses cannot repopulate USER B with USER A data", async ({ page, context }) => {
  await page.goto("/"); await login(page, "user"); await add(page);
  await favoriteFromCard(page); await settled(page);
  const tab = await context.newPage();
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  let started!: () => void; const loaded = new Promise<void>(resolve => { started = resolve; });
  let delayed = 0;
  await tab.route(/\/api\/(carrinho|favoritos)$/, async route => {
    const response = await route.fetch();
    if (delayed < 2) { delayed++; if (delayed === 2) started(); await gate; }
    await route.fulfill({ response });
  });
  await tab.goto("/"); await loaded;
  await logout(page, "user"); await login(page, "other");
  await expect(tab.getByRole("button", { name: "Nome", exact: true })).toBeVisible();
  release(); await settled(tab); await cartCount(tab, 0);
  await expect(card(tab).getByRole("button", { name: "Favoritar", exact: true })).toBeVisible();
  await tab.reload(); await settled(tab); await cartCount(tab, 0);
});

test("concurrent logins use the latest initiated login, not the slowest response", async ({ page, context }) => {
  await page.goto("/"); const tab = await context.newPage(); await tab.goto("/");
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  let started!: () => void; const loaded = new Promise<void>(resolve => { started = resolve; });
  await page.route("**/api/auth/login", async route => { const response = await route.fetch(); started(); await gate; await route.fulfill({ response }); });
  await page.getByRole("button", { name: "Entrar", exact: true }).first().click();
  await page.getByLabel("E-mail", { exact: true }).fill(accounts.user.email);
  await page.getByLabel("Senha", { exact: true }).fill(accounts.user.password);
  await page.locator('form button[type="submit"]').click(); await loaded;
  await login(tab, "other"); release();
  await expect(page.getByRole("button", { name: "Nome", exact: true })).toBeVisible();
  await page.reload(); await expect(page.getByRole("button", { name: "Nome", exact: true })).toBeVisible();
  await cartCount(page, 0);
});

test("legacy ambiguous cart and per-tab credential are not resurrected", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(({ authKey, product }) => {
    sessionStorage.setItem(authKey, JSON.stringify({ accessToken: "old-per-tab-credential", expiresAt: Date.now() + 60000 }));
    localStorage.setItem("brecho_cart_v1", JSON.stringify([{ product, colorId: product.colors[0].id, size: "M", quantity: 1 }]));
  }, { authKey, product });
  await page.reload(); await expect(page.getByRole("button", { name: "Entrar", exact: true }).first()).toBeVisible();
  await cartCount(page, 0); await login(page, "user"); await cartCount(page, 0);
  expect(await page.evaluate(key => sessionStorage.getItem(key) === null, authKey)).toBe(true);
});

for (const kind of ["user", "admin"] as const) {
  test(`${kind} persists beyond 15 minutes and restores after closing the browser context`, async ({ browser }) => {
    const context = await browser.newContext();
    let saved: Awaited<ReturnType<typeof context.storageState>>;
    try {
      const page = await context.newPage();
      await page.clock.install();
      await page.goto("/"); await login(page, kind); await page.goto("/");
      await expect(page.getByRole("button", { name: accounts[kind].name, exact: true })).toBeVisible();
      // Exercise the real long-session timer without waiting or changing server time.
      await page.clock.fastForward(16 * 60 * 1000);
      await expect(page.getByRole("button", { name: accounts[kind].name, exact: true })).toBeVisible();
      await page.reload();
      await expect(page.getByRole("button", { name: accounts[kind].name, exact: true })).toBeVisible();
      saved = await context.storageState();
    } finally { await context.close(); }
    // localStorage is what a persistent browser profile carries across restarts.
    const reopened = await browser.newContext({ storageState: saved! });
    try {
      const page = await reopened.newPage();
      const me = page.waitForResponse(r => r.url().endsWith("/api/auth/me"));
      await page.goto("/"); expect((await me).status()).toBe(200);
      await expect(page.getByRole("button", { name: accounts[kind].name, exact: true })).toBeVisible();
      await page.goto("/manager");
      // ADMIN: painel completo; cliente: o mesmo painel em modo leitura, com a faixa do modo demonstração.
      await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
      await expect(page.getByRole("note").filter({ hasText: "Modo demonstração — explore à vontade, as alterações não são salvas." })).toHaveCount(kind === "admin" ? 0 : 1);
      await page.goto("/");
      await logout(page, kind);
      expect(await page.evaluate(key => localStorage.getItem(key) === null, authKey)).toBe(true);
    } finally { await reopened.close(); }
  });
}

test("a passed local deadline revalidates with the backend and temporary failures do not log out", async ({ page }) => {
  await page.clock.install();
  await page.goto("/"); await login(page, "user");
  await page.evaluate(key => {
    const saved = JSON.parse(localStorage.getItem(key)!);
    saved.expiresAt = 1;
    localStorage.setItem(key, JSON.stringify(saved));
  }, authKey);
  await page.reload();
  await expect(page.getByRole("button", { name: "Cliente", exact: true })).toBeVisible();
  await page.route("**/api/auth/me", route => route.fulfill({ status: 503, json: { error: "Temporarily unavailable" } }));
  const failed = page.waitForResponse(r => r.url().endsWith("/api/auth/me") && r.status() === 503);
  await page.clock.fastForward(60000); await failed;
  await expect(page.getByRole("button", { name: "Cliente", exact: true })).toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key) !== null, authKey)).toBe(true);
  await page.unroute("**/api/auth/me");
  const recovered = page.waitForResponse(r => r.url().endsWith("/api/auth/me") && r.status() === 200);
  await page.clock.fastForward(60000); await recovered;
  await expect(page.getByRole("button", { name: "Cliente", exact: true })).toBeVisible();
  // The scheduling metadata cannot override a server-side expiration rejection.
  await page.route("**/api/auth/me", route => route.fulfill({ status: 401, json: { error: "Token expirado" } }));
  await page.clock.fastForward(60000);
  await expect(page.getByRole("button", { name: "Entrar", exact: true }).first()).toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key) === null, authKey)).toBe(true);
});
