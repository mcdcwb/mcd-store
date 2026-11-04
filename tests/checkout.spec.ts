import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";

let admin: string;
let shirt: any, cargo: any, originalStore: any;
const address = { cep: "80000000", street: "Rua São João", number: "123", complement: "Apto 7", neighborhood: "Centro", city: "Curitiba", state: "PR" };
const store = { address: { ...address, street: "Rua da Loja", number: "456", complement: "" }, whatsapp: "5541999999999" };
const api = (token: string) => ({ Authorization: `Bearer ${token}` });
const finalButton = (page: Page) => page.getByRole("button", { name: "Finalizar compra pelo WhatsApp", exact: true });

test.beforeAll(async ({ request }) => {
  expect(new URL(process.env.DATABASE_URL!).pathname).toMatch(/^\/mcd_store_test_/);
  const login = await request.post("/api/auth/login", { data: { email: process.env.E2E_ADMIN_EMAIL, password: process.env.E2E_ADMIN_PASSWORD } });
  admin = (await login.json()).accessToken;
  originalStore = await (await request.get("/api/settings/store", { headers: api(admin) })).json();
  const categories = await (await request.get("/api/categorias", { headers: api(admin) })).json();
  async function create(name: string, price: number, colors: any[]) {
    const response = await request.post("/api/produtos", { headers: api(admin), data: { name, price, public: "unissex", categoryId: categories[0].id, colors } });
    expect(response.ok()).toBe(true); return response.json();
  }
  shirt = await create("Camiseta Checkout", 79.9, [
    { colorName: "Preto", colorValue: "#111111", images: [], variants: [{ value: "M", stock: 5 }, { value: "G", stock: 5 }] },
    { colorName: "Azul Céu", colorValue: "#0000FF", images: [], variants: [{ value: "42", stock: 5 }] }
  ]);
  cargo = await create("Calça Cargo Checkout", 149.9, [{ colorName: "Bege", colorValue: "#CCCCCC", images: [], variants: [{ value: "42", stock: 5 }] }]);
});
test.afterAll(async ({ request }) => {
  if (originalStore) await request.put("/api/settings/store", { headers: api(admin), data: originalStore });
  for (const product of [shirt, cargo]) if (product) await request.delete(`/api/produtos/${product.id}`, { headers: api(admin) });
});

async function customer(page: Page, options: { authenticated?: boolean; address?: boolean; cart?: boolean } = {}) {
  const email = `checkout-${randomUUID()}@example.test`, password = "test-password";
  expect((await page.request.post("/api/auth/register", { data: { name: "João da Silva", email, password } })).ok()).toBe(true);
  const session = await (await page.request.post("/api/auth/login", { data: { email, password } })).json();
  const token = session.accessToken as string;
  if (options.address !== false) expect((await page.request.patch("/api/conta", { headers: api(token), data: { email, address } })).ok()).toBe(true);
  expect((await page.request.put("/api/settings/store", { headers: api(admin), data: store })).ok()).toBe(true);
  // Every test begins with sufficient stock, without changing variant identity.
  const colors = shirt.colors.map((color: any) => ({
    id: color.id, colorName: color.colorName, colorValue: color.colorValue, images: color.images,
    variants: color.variants.map((variant: any) => ({ id: variant.id, value: variant.value, stock: 5 }))
  }));
  expect((await page.request.put(`/api/produtos/${shirt.id}`, { headers: api(admin), data: { price: 79.9, colors } })).ok()).toBe(true);
  if (options.cart !== false) {
    for (const [product, quantity] of [[shirt, 2], [cargo, 1]] as const)
      expect((await page.request.post("/api/carrinho", { headers: api(token), data: { productId: product.id, colorId: product.colors[0].id, size: product.colors[0].variants[0].value, quantity } })).ok()).toBe(true);
  }
  if (options.authenticated !== false) await page.addInitScript(session => {
    localStorage.setItem("mcd-store_auth_v1", JSON.stringify({ accessToken: session.accessToken, expiresAt: session.expiresAt }));
  }, session);
  return { token, email, password };
}
async function fakePopup(page: Page) {
  await page.addInitScript(() => {
    const state = { opens: 0, closes: 0, urls: [] as string[] };
    (window as any).checkoutPopup = state;
    window.open = (() => {
      state.opens++; return {
        opener: null, closed: false, document: { title: "", body: { textContent: "" } },
        close() { state.closes++; }, location: { replace(url: string) { state.urls.push(url); } }
      };
    }) as any;
  });
}
async function received(page: Page) { return page.evaluate(() => (window as any).checkoutPopup); }

test("GUEST checkout login cancellation preserves cart, then login merges and returns to checkout", async ({ page }) => {
  const user = await customer(page, { authenticated: false, cart: false });
  await page.addInitScript(({ id, colorId }) => localStorage.setItem("brecho_guest_cart_v2", JSON.stringify([{ product: { id }, colorId, size: "M", quantity: 2 }])), { id: shirt.id, colorId: shirt.colors[0].id });
  await page.goto("/");
  await page.getByRole("button", { name: "Abrir carrinho" }).click();
  await page.getByRole("button", { name: "Finalizar compra", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Entrar", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Fechar login ou cadastro" }).click();
  await expect(page).toHaveURL(/\/$/);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("brecho_guest_cart_v2")!)[0].quantity)).toBe(2);
  await page.getByRole("button", { name: "Abrir carrinho" }).click();
  await page.getByRole("button", { name: "Finalizar compra", exact: true }).click();
  await page.getByLabel("E-mail", { exact: true }).fill(user.email);
  await page.getByLabel("Senha", { exact: true }).fill(user.password);
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/\/checkout$/);
  await expect(page.locator("main article")).toHaveCount(1);
  await expect(page.locator("main article")).toContainText("Quantidade: 2");
  await expect(page.locator('input[type="radio"]:checked')).toHaveCount(0);
});

for (const width of [1440, 390, 320]) test(`DELIVERY/PICKUP, exact message, cart clears after confirmation and stock stays unchanged at ${width}px`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 900 });
  const user = await customer(page); await fakePopup(page);
  const beforeProduct = (await (await page.request.get("/api/produtos")).json()).find((product: any) => product.id === shirt.id);
  await page.goto("/");
  await page.getByRole("button", { name: "Abrir carrinho" }).click();
  await page.getByRole("button", { name: "Finalizar compra", exact: true }).click();
  await expect(page).toHaveURL(/\/checkout$/);
  await expect(page.locator("main article")).toHaveCount(2);
  await expect(finalButton(page)).toBeDisabled();
  await page.getByRole("radio", { name: "Sim, preciso de entrega" }).check();
  await expect(page.locator("main address")).toContainText("Rua São João, 123");
  await expect(page.locator("main article").first()).toContainText("Subtotal: R$ 159,80");
  await expect(page.getByRole("complementary")).toContainText("R$ 309,70");
  const deliveryWarning = page.getByText("O valor de entrega será informado e combinado com a loja pelo WhatsApp. Ele não está incluído no total dos produtos.", { exact: true });
  await expect(deliveryWarning).toBeVisible();
  await expect(deliveryWarning).toHaveClass(/text-destructive/);
  const destructiveColor = await page.evaluate(() => {
    const probe = document.createElement("span");
    probe.style.color = "var(--destructive)";
    document.body.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  });
  await expect(deliveryWarning).toHaveCSS("color", destructiveColor);
  await expect(finalButton(page)).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath(`checkout-${width}.png`), fullPage: true });
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; }); let requests = 0;
  await page.route("**/api/checkout/whatsapp", async route => { requests++; await gate; await route.continue(); });
  await finalButton(page).click();
  await expect(page.getByRole("button", { name: "Validando pedido..." })).toBeDisabled();
  await page.getByRole("button", { name: "Validando pedido..." }).evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
  expect(requests).toBe(1); expect((await received(page)).opens).toBe(1);
  release();
  await expect.poll(async () => (await received(page)).urls.length).toBe(1);
  const message = new URL((await received(page)).urls[0]).searchParams.get("text")!;
  expect(message).toContain("Olá, meu nome é João da Silva.");
  expect(message).toContain("Qtd: 2x Camiseta Checkout.\nCor: *Preto*\nTamanho: *M*\nPreço: R$159,80.");
  const expectedItems = "Olá, meu nome é João da Silva.\n\nEste é o meu pedido:\n\n- Qtd: 2x Camiseta Checkout.\nCor: *Preto*\nTamanho: *M*\nPreço: R$159,80.\n\n- Qtd: 1x Calça Cargo Checkout.\nCor: *Bege*\nTamanho: *42*\nPreço: R$149,90.";
  expect(message).toMatch(/Pedido: \*#\d{8}\*/);
  expect(message.replace(/\n\nPedido: \*#\d{8}\*/, "")).toBe(`${expectedItems}\n\nPrecisa de entrega? *Sim*.\n\nEndereço: Rua São João, 123 · Apto 7 · Centro · Curitiba - PR · CEP 80000-000.\n\nValor Total de produtos: *R$309,70*.`);
  expect(message).toContain("Precisa de entrega? *Sim*.");
  expect(message).toContain("Endereço: Rua São João, 123 · Apto 7 · Centro · Curitiba - PR · CEP 80000-000.");
  expect(message).toContain("Valor Total de produtos: *R$309,70*.");
  await expect(page).toHaveURL(/\/meus-pedidos$/);
  await expect(page).toHaveURL(/\/meus-pedidos$/);
  expect((await (await page.request.get("/api/carrinho/conferencia", { headers: api(user.token) })).json()).items).toEqual([]);
  for (const [product, quantity] of [[shirt, 2], [cargo, 1]] as const)
    expect((await page.request.post("/api/carrinho", { headers: api(user.token), data: { productId: product.id, colorId: product.colors[0].id, size: product.colors[0].variants[0].value, quantity } })).ok()).toBe(true);
  await page.goto("/checkout");
  await fakePopup(page);
  await page.getByRole("radio", { name: "Não preciso, irei retirar os produtos na loja" }).check();
  await expect(page.locator("main address")).toContainText("Rua da Loja, 456");
  await finalButton(page).click();
  await expect.poll(async () => (await received(page)).urls.length).toBe(1);
  const pickup = new URL((await received(page)).urls[0]);
  expect(pickup.pathname).toBe("/5541999999999"); expect(pickup.searchParams.get("text")).toContain("Precisa de entrega? *Não*.");
  expect(pickup.searchParams.get("text")).not.toContain("Endereço:");
  expect(pickup.searchParams.get("text")!.replace(/\n\nPedido: \*#\d{8}\*/, "")).toBe(`${expectedItems}\n\nPrecisa de entrega? *Não*.\n\nValor Total de produtos: *R$309,70*.`);
  await expect(page).toHaveURL(/\/meus-pedidos$/);
  expect((await (await page.request.get("/api/carrinho/conferencia", { headers: api(user.token) })).json()).items).toEqual([]);
  expect((await (await page.request.get("/api/produtos")).json()).find((product: any) => product.id === shirt.id)).toEqual(beforeProduct);
});

test("missing customer address is registered in Minha Conta and returns with delivery preserved", async ({ page }) => {
  await customer(page, { address: false });
  await page.goto("/checkout");
  await fakePopup(page);
  await page.getByRole("radio", { name: "Sim, preciso de entrega" }).check();
  await expect(finalButton(page)).toBeDisabled();
  await page.getByRole("link", { name: "Cadastrar endereço" }).click();
  await expect(page).toHaveURL(/\/minha-conta\?returnTo=\/checkout#address-title$/);
  await page.route("https://viacep.com.br/**", route => route.fulfill({ json: { logradouro: address.street, bairro: address.neighborhood, localidade: address.city, uf: address.state } }));
  await page.getByLabel("CEP", { exact: true }).fill(address.cep);
  await expect(page.getByLabel("Rua / Logradouro")).toHaveValue(address.street);
  await page.getByLabel("Número", { exact: true }).fill("321");
  await page.getByRole("button", { name: "Salvar alterações", exact: true }).click();
  await page.getByRole("link", { name: "Voltar ao checkout com alterações salvas" }).click();
  await expect(page.getByRole("radio", { name: "Sim, preciso de entrega" })).toBeChecked();
  await expect(page.locator("main address")).toContainText("Rua São João, 321");
  await expect(finalButton(page)).toBeEnabled();
  await page.reload();
  await expect(page.getByRole("radio", { name: "Sim, preciso de entrega" })).toBeChecked();
  await page.goto("/minha-conta?returnTo=https://example.test");
  await expect(page.getByRole("link", { name: "Voltar ao checkout", exact: true })).toHaveCount(0);
});

test("missing store address/contact and loading failures block finalization without fictional fallback", async ({ page }) => {
  await customer(page);
  await page.route("**/api/settings/public", route => route.fulfill({ json: { address: null, whatsapp: null } }));
  await page.goto("/checkout");
  await fakePopup(page);
  await page.getByRole("radio", { name: "Não preciso, irei retirar os produtos na loja" }).check();
  await expect(page.locator("main")).toContainText("local de retirada está temporariamente indisponível");
  await expect(page.locator("main")).toContainText("contato da loja está temporariamente indisponível");
  await expect(finalButton(page)).toBeDisabled();
  await page.route("**/api/settings/public", route => route.fulfill({ status: 503, json: { error: "Falha" } }));
  await page.reload();
  await expect(page.locator("main")).toContainText("Não foi possível carregar as configurações");
  await page.route("**/api/conta", route => route.fulfill({ status: 503, json: { error: "Falha" } }));
  await page.reload();
  await page.getByRole("radio", { name: "Sim, preciso de entrega" }).check();
  await expect(page.locator("main")).toContainText("Não foi possível carregar sua conta e endereço");
  await expect(page.getByRole("link", { name: "Cadastrar endereço" })).toHaveCount(0);
  await expect(finalButton(page)).toBeDisabled();
});

test("stock changes immediately before finalization block WhatsApp until explicit cart revision", async ({ page }) => {
  const user = await customer(page); await fakePopup(page);
  await page.goto("/checkout"); await page.getByRole("radio", { name: "Sim, preciso de entrega" }).check();
  await expect(finalButton(page)).toBeEnabled();
  const colors = shirt.colors.map((color: any, index: number) => ({
    id: color.id, colorName: color.colorName, colorValue: color.colorValue, images: color.images,
    variants: color.variants.map((variant: any, v: number) => ({ id: variant.id, value: variant.value, stock: index === 0 && v === 0 ? 1 : 5 }))
  }));
  expect((await page.request.put(`/api/produtos/${shirt.id}`, { headers: api(admin), data: { colors } })).ok()).toBe(true);
  await finalButton(page).click();
  await expect(page.locator("main")).toContainText("Você selecionou 2 unidades, mas agora existem apenas 1 disponíveis");
  await expect(finalButton(page)).toBeDisabled();
  expect((await received(page)).urls).toEqual([]);
  const cart = await (await page.request.get("/api/carrinho/conferencia", { headers: api(user.token) })).json(); expect(cart.items[0].quantity).toBe(2);
  await page.getByRole("button", { name: "Revisar no carrinho", exact: true }).click();
  await page.getByRole("button", { name: "Diminuir quantidade" }).first().click();
  await expect(page.locator("span.w-6").first()).toHaveText("1");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("complementary")).toContainText("R$ 229,80");
  await expect(page.getByRole("radio", { name: "Sim, preciso de entrega" })).toBeChecked();
  await expect(finalButton(page)).toBeEnabled();
  await finalButton(page).click(); await expect.poll(async () => (await received(page)).urls.length).toBe(1);
});

test("empty cart and ADMIN direct access; logout clears checkout draft", async ({ page }) => {
  await customer(page, { cart: false }); await page.goto("/checkout");
  await expect(page.locator("main")).toContainText("Seu carrinho está vazio");
  await expect(finalButton(page)).toBeDisabled();
  await page.getByRole("radio", { name: "Não preciso, irei retirar os produtos na loja" }).check();
  await page.getByRole("button", { name: "João", exact: true }).click();
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  expect(await page.evaluate(() => sessionStorage.getItem("mcd-store_checkout_v1"))).toBeNull();
  const adminPage = await page.context().newPage();
  await adminPage.goto("/");
  await adminPage.evaluate(token => { localStorage.setItem("mcd-store_auth_v1", JSON.stringify({ accessToken: token, expiresAt: Date.now() + 3600000 })); }, admin);
  await adminPage.goto("/checkout");
  await expect(adminPage.getByRole("heading", { name: "Checkout exclusivo para clientes" })).toBeVisible();
  await expect(finalButton(adminPage)).toHaveCount(0);
});
