import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";

const make = (id: number, category = "camisetas", audience = "unissex", published = true, multiple = false) => ({
  id, name: `Relacionado ${id}`, price: 30, public: audience, category, isPublished: published, inCarousel: !published, badge: "NOVIDADE",
  colors: [{ id: id * 10, colorName: "Preto", colorValue: "#111111", images: ["/related-front.svg", "/related-back.svg"], variants: [{ id: id * 10, value: "P", stock: 1 }, { id: id * 10 + 1, value: "M", stock: 5 }] },
  ...(multiple ? [{ id: id * 10 + 2, colorName: "Branco", colorValue: "#FFFFFF", images: ["/related-back.svg"], variants: [{ id: id * 10 + 2, value: "P", stock: 3 }] }] : [])]
});
const current = make(100);
const catalog = [make(105, "camisetas", "unissex", false), make(104, "calcas", "feminino"), make(103, "calcas"), make(102), make(101, "camisetas", "unissex", true, true), make(101, "camisetas", "unissex", true, true), current];

async function setup(page: Page, products = catalog) {
  let requests = 0;
  await page.route("**/api/produtos", route => { requests++; return route.fulfill({ json: products }); });
  await page.route("**/api/produtos/carrossel", route => route.fulfill({ json: [make(105, "camisetas", "unissex", false)] }));
  await page.route("**/api/settings/public", route => route.fulfill({ json: { address: null, whatsapp: null, lowStockThreshold: 5, showLastUnitBadge: true, showLowStockBadge: true } }));
  await page.route("**/related-*.svg", route => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500"><rect width="400" height="500" fill="#ddd"/></svg>' }));
  await page.goto("/?productId=100");
  await expect(page.getByRole("heading", { name: "Relacionado 100", exact: true })).toBeVisible();
  return () => requests;
}

for (const width of [320, 390, 768, 1440]) test(`related products preserve cards, navigation and responsive layout at ${width}`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 1000 });
  const requests = await setup(page);
  const section = page.getByRole("region", { name: "VEJA TAMBÉM" }), cards = section.locator(".store-product-card");
  await expect(cards).toHaveCount(3);
  await expect(cards.locator("p.line-clamp-2")).toHaveText(["Relacionado 101", "Relacionado 102", "Relacionado 103"]);
  await expect(section.getByText("Relacionado 105", { exact: true })).toHaveCount(0);
  const first = cards.first();
  await first.evaluate(el => window.scrollTo(0, window.scrollY + el.getBoundingClientRect().top - 120));
  await first.getByRole("img").hover();
  await first.getByRole("button", { name: "Próxima imagem", exact: true }).click();
  await expect(first.getByRole("img")).toHaveAttribute("src", "/related-back.svg");
  await first.getByRole("button", { name: "Preto", exact: true }).click();
  await first.getByRole("button", { name: "P", exact: true }).click();
  await expect(first.locator(".store-badge-automatic")).toHaveAccessibleName("ÚLTIMA PEÇA");
  await first.getByRole("button", { name: "Branco", exact: true }).click();
  await expect(first.locator(".store-badge-automatic")).toHaveAccessibleName("POUCAS UNIDADES");
  await first.evaluate(el => window.scrollTo(0, window.scrollY + el.getBoundingClientRect().top - 120));
  await first.getByRole("img").hover();
  await first.getByRole("button", { name: "Favoritar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Entrar", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await first.getByRole("button", { name: "Adicionar ao carrinho", exact: true }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("brecho_guest_cart_v2") ?? "[]").some((item: any) => item.product.id === 101 && item.colorId === 1012 && item.size === "P"))).toBe(true);
  await expect(cards.locator(".store-badge-manual")).toHaveCount(3);
  const geometry = await cards.evaluateAll(elements => elements.map(card => {
    const photo = card.querySelector(".store-product-photo")!.getBoundingClientRect();
    return { top: (card as HTMLElement).offsetTop, ratio: photo.height / photo.width };
  }));
  for (const item of geometry) expect(item.ratio).toBeCloseTo(1.25, 2);
  if (width >= 768) expect(geometry.every(item => Math.abs(item.top - geometry[0].top) < 1)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await section.screenshot({ path: info.outputPath(`related-${width}.png`) });
  await first.evaluate(el => window.scrollTo(0, window.scrollY + el.getBoundingClientRect().top - 120));
  await first.getByRole("img").click();
  await expect(page).toHaveURL(/\?productId=101$/);
  await expect(page.getByRole("heading", { name: "Relacionado 101", exact: true })).toBeVisible();
  await expect(page.locator(".store-product-detail-content").getByRole("button", { name: "Selecione o tamanho", exact: true })).toBeDisabled();
  await expect(page.locator(".store-detail-photo .store-badge-automatic")).toHaveCount(0);
  await expect(section.locator("p.line-clamp-2")).toHaveText(["Relacionado 100", "Relacionado 102", "Relacionado 103"]);
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Relacionado 100", exact: true })).toBeVisible();
  await page.goForward();
  await expect(page.getByRole("heading", { name: "Relacionado 101", exact: true })).toBeVisible();
  expect(requests()).toBe(1);
});

test("related section is hidden with no eligible product and shows only available recommendations", async ({ page }) => {
  await setup(page, [current, make(105, "camisetas", "unissex", false)]);
  await expect(page.getByRole("region", { name: "VEJA TAMBÉM" })).toHaveCount(0);
  await page.unroute("**/api/produtos");
  await page.route("**/api/produtos", route => route.fulfill({ json: [current, make(104, "calcas", "feminino")] }));
  await page.reload();
  await expect(page.getByRole("region", { name: "VEJA TAMBÉM" }).locator(".store-product-card")).toHaveCount(1);
});

test("related products ignore active catalog filters", async ({ page }) => {
  await setup(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Feminino", exact: true }).first().click();
  await page.getByRole("button", { name: "M", exact: true }).first().click();
  await page.locator('.store-product-card').filter({ has: page.getByText("Relacionado 100", { exact: true }) }).locator("a").evaluate((anchor: HTMLAnchorElement) => { anchor.removeAttribute("target"); });
  await page.locator('.store-product-card').filter({ has: page.getByText("Relacionado 100", { exact: true }) }).getByRole("img").click();
  await expect(page.getByRole("region", { name: "VEJA TAMBÉM" }).locator("p.line-clamp-2")).toHaveText(["Relacionado 101", "Relacionado 102", "Relacionado 103"]);
});

for (const role of ["USER", "ADMIN"] as const) test(`related cards preserve authenticated ${role} favorites and cooldown`, async ({ page }) => {
  const admin = await (await page.request.post("/api/auth/login", { data: { email: process.env.E2E_ADMIN_EMAIL, password: process.env.E2E_ADMIN_PASSWORD } })).json();
  const adminHeaders = { Authorization: `Bearer ${admin.accessToken}` };
  const categoryId = (await (await page.request.get("/api/categorias", { headers: adminHeaders })).json())[0].id;
  const created: any[] = [];
  const session = role === "ADMIN" ? admin : await (await page.request.post("/api/auth/login", { data: { email: process.env.E2E_USER_EMAIL, password: process.env.E2E_USER_PASSWORD } })).json();
  const headers = { Authorization: `Bearer ${session.accessToken}` };
  try {
    for (const name of ["Atual", "Sugestão"]) {
      const response = await page.request.post("/api/produtos", {
        headers: adminHeaders, data: {
          name: `${name} ${randomUUID()}`, price: 30, public: "unissex", categoryId, isPublished: true, badge: "NOVIDADE",
          colors: [{ colorName: "Preto", colorValue: "#111111", images: [], variants: [{ value: "P", stock: 3 }] }]
        }
      });
      expect(response.status()).toBe(201); created.push(await response.json());
    }
    await page.route("**/api/produtos", route => route.fulfill({ json: created }));
    await page.addInitScript(value => localStorage.setItem("mcd-store_auth_v1", JSON.stringify(value)), { accessToken: session.accessToken, expiresAt: session.expiresAt });
    await page.goto(`/?productId=${created[0].id}`);
    const card = page.getByRole("region", { name: "VEJA TAMBÉM" }).locator(".store-product-card");
    await card.evaluate(el => window.scrollTo(0, window.scrollY + el.getBoundingClientRect().top - 120));
    await card.getByRole("img").hover();
    const bookmark = card.locator(".store-favorite-bookmark");
    await expect(bookmark).toBeEnabled(); await bookmark.click();
    await expect(bookmark).toHaveAttribute("aria-pressed", "true");
    await bookmark.hover(); await expect(card.locator(".store-favorite-tooltip")).toHaveText("Desfavoritar");
    await expect(page.locator("[data-sonner-toast]").filter({ hasText: "Produto adicionado aos favoritos!" })).toHaveCount(1);
    expect((await (await page.request.get("/api/favoritos", { headers })).json()).some((entry: any) => entry.product.id === created[1].id)).toBe(true);
    await expect(bookmark).toHaveCSS("cursor", "pointer"); await bookmark.click();
    await expect(bookmark).toHaveAttribute("aria-pressed", "false");
    await bookmark.hover(); await expect(card.locator(".store-favorite-tooltip")).toHaveText("Adicionar aos Favoritos");
    await expect(page.locator("[data-sonner-toast]").filter({ hasText: "Produto removido dos favoritos!" })).toHaveCount(1);
    const detailFavorite = page.locator(".store-detail-photo .store-favorite-bookmark"), detailTooltip = page.locator(".store-detail-photo .store-favorite-tooltip");
    await detailFavorite.hover(); await expect(detailTooltip).toHaveText("Adicionar aos Favoritos");
    await detailFavorite.click(); await expect(detailFavorite).toHaveAttribute("aria-pressed", "true");
    await detailFavorite.hover(); await expect(detailTooltip).toHaveText("Desfavoritar");
    await expect(detailFavorite).toBeEnabled(); await detailFavorite.click(); await expect(detailFavorite).toHaveAttribute("aria-pressed", "false");
    await detailFavorite.hover(); await expect(detailTooltip).toHaveText("Adicionar aos Favoritos");
  } finally {
    if (created[1]) await page.request.delete(`/api/favoritos/${created[1].id}`, { headers });
    for (const product of created) await page.request.delete(`/api/produtos/${product.id}`, { headers: adminHeaders });
  }
});
