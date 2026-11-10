import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";

for (const width of [320, 390, 768, 1440]) test(`variant badges, fixed slots and updated stock at ${width}`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 1000 });
  let settings = { lowStockThreshold: 5, showLowStockBadge: true, showLastUnitBadge: true };
  const product = {
    id: 9500, name: "Variant badge fixture", badge: "EDIÇÃO ESPECIAL", badgeBackgroundColor: "#2457A7", badgeTextColor: "#FFFFFF", price: 30, public: "unissex", category: "camisetas", colors: [
      { id: 9501, colorName: "Preto", colorValue: "#111111", images: ["/variant-light.svg", "/variant-dark.svg"], variants: [{ id: 1, value: "A", stock: 1 }, { id: 2, value: "B", stock: 5 }, { id: 3, value: "C", stock: 10 }, { id: 4, value: "D", stock: 0 }] },
      { id: 9502, colorName: "Branco", colorValue: "#FFFFFF", images: ["/variant-dark.svg"], variants: [{ id: 5, value: "A", stock: 8 }, { id: 6, value: "B", stock: 3 }] }
    ]
  };
  await page.route("**/api/produtos", route => route.fulfill({ json: [product] }));
  await page.route("**/api/settings/public", route => route.fulfill({ json: { ...settings, address: null, whatsapp: null } }));
  await page.route("**/variant-*.svg", route => route.fulfill({ contentType: "image/svg+xml", body: `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500"><rect width="400" height="500" fill="${route.request().url().includes("light") ? "#eeeeee" : "#111111"}"/></svg>` }));
  await page.goto("/");
  const card = page.locator(".store-product-card");
  const last = card.locator(".store-stock-last"), low = card.locator(".store-stock-low"), manual = card.locator(".store-badge-manual");
  const select = async (size: string) => card.getByRole("button", { name: size, exact: true }).click();
  await expect(last).toHaveCount(0);
  await select("A"); await expect(last).toHaveCount(0);
  await select("A");
  await card.getByRole("button", { name: "Preto", exact: true }).click();
  await expect(last).toHaveCount(0); await select("A");
  await expect(last).toBeVisible();
  const manualTop = await manual.evaluate(el => el.getBoundingClientRect().top - el.closest(".store-product-photo")!.getBoundingClientRect().top);
  const verify = async () => {
    const geometry = await card.evaluate(el => {
      const photo = el.querySelector(".store-product-photo")!.getBoundingClientRect();
      const auto = el.querySelector(".store-badge-automatic")?.getBoundingClientRect();
      const price = el.querySelector(".store-product-price")?.getBoundingClientRect();
      const stockSlot = el.querySelector(".store-stock-slot")?.getBoundingClientRect();
      const manual = el.querySelector(".store-badge-manual")!.getBoundingClientRect();
      const controls = [...el.querySelectorAll(".store-product-photo .store-image-control, .store-product-photo .store-favorite-bookmark path, .store-product-photo-pagination button")].map(b => b.getBoundingClientRect());
      const overlaps = (a: DOMRect, b: DOMRect) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      const autoInPrice = !auto || (!!price && !!stockSlot && overlaps(auto, stockSlot) && overlaps(auto, price) && auto.top >= photo.bottom);
      return {
        autoInPrice, manualTop: manual.top - photo.top,
        clear: controls.every(c => !overlaps(manual, c)),
        inside: manual.left >= el.getBoundingClientRect().left - 0.1 && manual.bottom <= photo.bottom + 0.05 && manual.right <= photo.right
      };
    });
    expect(geometry.autoInPrice).toBe(true); expect(geometry.manualTop).toBeCloseTo(manualTop, 2);
    expect(geometry.clear).toBe(true); expect(geometry.inside).toBe(true);
  };
  await verify();
  const redSize = (await last.boundingBox())!.width;
  const redFont = await last.evaluate(el => parseFloat(getComputedStyle(el).fontSize));
  await select("A"); await expect(last).toHaveCount(0);
  await select("A"); await expect(last).toBeVisible();
  await select("B"); await expect(low).toBeVisible(); await expect(last).toHaveCount(0);
  expect((await low.boundingBox())!.width).toBeGreaterThan(redSize);
  expect(redFont).toBe(11);
  expect(await low.evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBe(redFont);
  expect((await manual.boundingBox())!.width).toBeLessThan((await low.boundingBox())!.width);
  await verify();
  await select("C"); await expect(card.locator(".store-badge-automatic")).toHaveCount(0); await verify();
  await expect(card.getByRole("button", { name: "D", exact: true })).toBeDisabled();
  await select("A"); await card.getByRole("button", { name: "Branco", exact: true }).click();
  await expect(card.locator(".store-badge-automatic")).toHaveCount(0);
  await select("A"); // incomplete selection: only the explicitly chosen white color
  await expect(low).toHaveCount(0);
  await select("B"); await expect(low).toBeVisible();
  await card.getByRole("button", { name: "Preto", exact: true }).click(); await expect(low).toBeVisible();
  await select("A"); await expect(last).toBeVisible();
  settings = { ...settings, showLastUnitBadge: false };
  await page.evaluate(() => window.dispatchEvent(new Event("store-details-updated")));
  await expect(low).toBeVisible();
  settings = { ...settings, showLowStockBadge: false };
  await page.evaluate(() => window.dispatchEvent(new Event("store-details-updated")));
  await expect(card.locator(".store-badge-automatic")).toHaveCount(0); await verify();
  settings = { ...settings, showLastUnitBadge: true, showLowStockBadge: true };
  await page.evaluate(() => window.dispatchEvent(new Event("store-details-updated")));
  await expect(last).toBeVisible();
  product.colors[0].variants[0].stock = 0;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(card.getByRole("button", { name: "A", exact: true })).toBeDisabled();
  await expect(card.locator(".store-badge-automatic")).toHaveCount(0); await verify();
  await card.evaluate(el => window.scrollTo(0, window.scrollY + el.getBoundingClientRect().top - 120));
  await card.getByRole("img").hover();
  await card.screenshot({ path: info.outputPath(`manual-only-${width}.png`) });
  await select("B"); await expect(low).toBeVisible();
  await card.evaluate(el => window.scrollTo(0, window.scrollY + el.getBoundingClientRect().top - 120));
  await card.getByRole("img").hover();
  await card.getByRole("button", { name: "Próxima imagem", exact: true }).click();
  await card.screenshot({ path: info.outputPath(`dark-badges-${width}.png`) });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("ADMIN favorites persist, synchronize, isolate USER, and release pending/cooldown/error cursors", async ({ page, context }, info) => {
  test.setTimeout(60000);
  const login = await page.request.post("/api/auth/login", { data: { email: process.env.E2E_ADMIN_EMAIL, password: process.env.E2E_ADMIN_PASSWORD } });
  const session = await login.json(); const headers = { Authorization: `Bearer ${session.accessToken}` };
  const categoryId = (await (await page.request.get("/api/categorias", { headers })).json())[0].id;
  const created = await page.request.post("/api/produtos", { headers, data: { name: `Admin favorites ${randomUUID()}`, price: 30, public: "unissex", categoryId, badge: "NOVO", colors: [{ colorName: "Preto", colorValue: "#111111", images: [], variants: [{ value: "P", stock: 1 }] }] } });
  const product = await created.json(); expect(created.status()).toBe(201);
  const customer = await (await page.request.post("/api/auth/login", { data: { email: process.env.E2E_USER_EMAIL, password: process.env.E2E_USER_PASSWORD } })).json();
  const userHeaders = { Authorization: `Bearer ${customer.accessToken}` };
  const card = (p: Page) => p.locator(".store-product-card").filter({ has: p.getByText(product.name, { exact: true }) });
  const reveal = async (p: Page) => { await card(p).evaluate(el => window.scrollTo(0, window.scrollY + el.getBoundingClientRect().top - 120)); await card(p).getByRole("img").hover(); };
  try {
    await page.request.put(`/api/favoritos/${product.id}`, { headers: userHeaders });
    await page.addInitScript(value => localStorage.setItem("mcd-store_auth_v1", JSON.stringify(value)), { accessToken: session.accessToken, expiresAt: session.expiresAt });
    await page.goto("/"); await reveal(page);
    const button = card(page).locator(".store-favorite-bookmark");
    await expect(button).toBeEnabled(); await expect(button).toHaveCSS("cursor", "pointer");
    let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route("**/api/favoritos", async route => { if (route.request().method() !== "GET") await gate; await route.continue(); });
    await button.click(); await expect(button).toHaveAttribute("aria-busy", "true"); await expect(button).toHaveCSS("cursor", "progress");
    release(); await expect(button).toHaveAttribute("aria-pressed", "true");
    await button.hover();
    await expect(page.getByRole("tooltip", { name: "Desfavoritar" })).toBeVisible();
    await expect(button).toHaveAttribute("aria-busy", "false"); await expect(button).toHaveCSS("cursor", "not-allowed");
    await expect(page.locator("[data-sonner-toast]").filter({ hasText: "Produto adicionado aos favoritos!" })).toHaveCount(1);
    await expect(button).toBeEnabled(); await expect(button).toHaveCSS("cursor", "pointer");
    await page.unroute("**/api/favoritos");
    await page.reload(); await expect(card(page).locator(".store-favorite-bookmark")).toHaveAttribute("aria-pressed", "true");
    await expect(card(page).locator(".store-favorite-bookmark")).toHaveAttribute("aria-pressed", "true");
    const tab = await context.newPage(); await tab.goto("/favoritos");
    await expect(tab.getByRole("heading", { name: "Favoritos", exact: true })).toBeVisible(); await expect(card(tab)).toBeVisible();
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 }); await reveal(page);
      await expect(button).toHaveCSS("cursor", "pointer");
      await card(page).screenshot({ path: info.outputPath(`admin-favorite-${width}.png`) });
    }
    await page.route("**/api/favoritos", route => route.request().method() === "GET" ? route.continue() : route.fulfill({ status: 503, json: { error: "Favorite unavailable" } }));
    await button.click(); await expect(page.getByRole("alert")).toContainText("Favorite unavailable");
    await expect(button).toBeEnabled(); await expect(button).toHaveCSS("cursor", "pointer"); await expect(button).toHaveAttribute("aria-pressed", "true");
    await page.unroute("**/api/favoritos");
    await reveal(page);
    await button.click(); await expect(button).toHaveAttribute("aria-pressed", "false"); await expect(button).toHaveCSS("cursor", "not-allowed");
    await expect(card(tab)).toHaveCount(0);
    await expect(page.locator("[data-sonner-toast]").filter({ hasText: "Produto removido dos favoritos!" })).toHaveCount(1);
    await expect(button).toBeEnabled(); await expect(button).toHaveCSS("cursor", "pointer");
    expect((await (await page.request.get("/api/favoritos", { headers: userHeaders })).json()).some((row: any) => row.product.id === product.id)).toBe(true);
    await tab.close();
  } finally { await page.request.delete(`/api/produtos/${product.id}`, { headers }); }
});
