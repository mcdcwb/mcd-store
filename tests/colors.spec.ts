import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
async function login(page: Page, admin = false) {
  await page.getByRole("button", { name: "Entrar", exact: true }).first().click();
  await page.getByLabel("E-mail", { exact: true }).fill(process.env[admin ? "E2E_ADMIN_EMAIL" : "E2E_USER_EMAIL"]!);
  await page.getByLabel("Senha", { exact: true }).fill(process.env[admin ? "E2E_ADMIN_PASSWORD" : "E2E_USER_PASSWORD"]!);
  await page.locator('form button[type="submit"]').click();
  if (admin) await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
  else await expect(page.getByRole("button", { name: "Cliente", exact: true })).toBeVisible();
}
async function images(page: Page) {
  await page.route("**/colors-*.svg", route => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="#a1b2c3"/></svg>' }));
}
test("manager adds second/third colors, isolates picker/images/stock, edits and confirms removal", async ({ page }, testInfo) => {
  await images(page);
  await page.addInitScript(() => Object.defineProperty(window, "EyeDropper", { configurable: true, value: class { async open() { return { sRGBHex: "#a1b2c3" }; } } }));
  await page.goto("/manager"); await login(page, true);
  const headers = { Authorization: `Bearer ${await page.evaluate(() => JSON.parse(localStorage.getItem("mcd-store_auth_v1")!).accessToken)}` };
  let id: number | undefined;
  try {
    await page.getByRole("link", { name: "Produtos", exact: true }).click(); await page.getByRole("link", { name: "Novo produto" }).click();
    await expect(page.getByRole("button", { name: "Remover cor", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "Salvar produto" }).click();
    await expect(page.getByRole("alert")).toContainText("nome da cor");
    const name = "Multicor " + randomUUID();
    await page.getByLabel("Nome", { exact: true }).fill(name); await page.getByLabel("Preço (R$)", { exact: true }).fill("99.90");
    await expect(page.getByLabel("Prévia do badge", { exact: true })).toContainText("Sem badge");
    await expect(page.getByLabel("Badge (opcional)")).toHaveValue("");
    await page.getByLabel("Badge (opcional)").fill("Novo");
    const preview = page.getByLabel("Prévia do badge", { exact: true });
    await expect(preview).toContainText("Novo");
    await page.getByLabel("Cor de fundo do badge", { exact: true }).fill("#123456");
    await page.getByLabel("Seletor: Cor do texto do badge", { exact: true }).fill("#fedcba");
    await expect(preview.locator("path")).toHaveAttribute("fill", "#123456");
    await expect(preview.locator(".product-tag")).toHaveCSS("color", "rgb(254, 220, 186)");
    for (const [index, color] of ["Preto", "Branco", "Verde"].entries()) {
      if (index) await page.getByRole("button", { name: "+ Adicionar cor", exact: true }).click();
      await page.getByLabel("Nome da cor", { exact: true }).fill(color);
      await page.getByLabel("Valor da cor", { exact: true }).fill(index ? "#ffffff" : "#111111");
      await page.getByLabel("Imagem principal", { exact: true }).fill(`/colors-${color}.svg`);
      await page.getByLabel("Variante 1", { exact: true }).fill("P"); await page.getByLabel("Estoque 1", { exact: true }).fill(String(index + 1));
    }
    const tabs = page.getByRole("group", { name: "Cores do produto", exact: true });
    await tabs.getByRole("button", { name: "Branco", exact: true }).click();
    await page.getByRole("button", { name: "Selecionar na imagem" }).click();
    await expect(page.getByLabel("Valor da cor", { exact: true })).toHaveValue("#A1B2C3");
    await expect(page.getByLabel("Seletor de cor", { exact: true })).toHaveValue("#a1b2c3");
    await tabs.getByRole("button", { name: "Preto", exact: true }).click();
    await expect(page.getByLabel("Valor da cor", { exact: true })).toHaveValue("#111111");
    await expect(page.getByLabel("Imagem principal", { exact: true })).toHaveValue("/colors-Preto.svg");
    await expect(page.getByLabel("Estoque 1", { exact: true })).toHaveValue("1");
    await page.getByLabel("Seletor de cor", { exact: true }).fill("#123456");
    await tabs.getByRole("button", { name: "Verde", exact: true }).click();
    await page.getByRole("button", { name: "Remover cor", exact: true }).click();
    await expect(page.getByRole("alertdialog")).toBeVisible(); await page.getByRole("button", { name: "Cancelar remoção" }).click();
    const created = page.waitForResponse(r => r.url().endsWith("/api/produtos") && r.request().method() === "POST");
    await page.getByRole("button", { name: "Salvar produto" }).click();
    const response = await created; expect(response.status()).toBe(201); const product = await response.json(); id = product.id;
    expect(product.badgeBackgroundColor).toBe("#123456"); expect(product.badgeTextColor).toBe("#FEDCBA");
    expect(product.colors).toHaveLength(3); expect(Number(product.price)).toBe(99.9); expect(product.badge).toBe("Novo");
    expect(product.colors.map((c: any) => c.colorValue)).toEqual(["#123456", "#A1B2C3", "#FFFFFF"]);
    const storefront = await page.context().newPage();
    try {
      await images(storefront); await storefront.goto('/');
      const publicCard = storefront.locator('.store-product-card').filter({ has: storefront.getByText(name, { exact: true }) });
      for (const width of [320, 390, 768, 1440]) {
        await storefront.setViewportSize({ width, height: 1000 });
        const manual = publicCard.locator('.store-badge-manual');
        await expect(manual).toContainText('Novo');
        await expect(manual.locator('path')).toHaveAttribute('fill', '#123456');
        await expect(manual).toHaveCSS('color', 'rgb(254, 220, 186)');
        await publicCard.evaluate(el => window.scrollTo(0, window.scrollY + el.getBoundingClientRect().top - 120));
        await publicCard.getByRole('img').hover();
        await publicCard.screenshot({ path: testInfo.outputPath(`custom-badge-${width}.png`) });
      }
    } finally { await storefront.close(); }

    await page.getByRole("article", { name, exact: true }).getByRole("link", { name: "Editar" }).click();
    await page.reload();
    await expect(page.getByLabel("Cor de fundo do badge", { exact: true })).toHaveValue("#123456");
    await expect(page.getByLabel("Cor do texto do badge", { exact: true })).toHaveValue("#FEDCBA");
    await expect(page.getByRole("button", { name: "+ Adicionar cor", exact: true })).toBeVisible();
    await tabs.getByRole("button", { name: "Branco", exact: true }).click();
    await expect(page.getByLabel("Seletor de cor", { exact: true })).toHaveValue("#a1b2c3");
    await page.getByLabel("Estoque 1", { exact: true }).fill("7");
    await tabs.getByRole("button", { name: "Verde", exact: true }).click();
    await page.getByRole("button", { name: "Remover cor", exact: true }).click(); await page.getByRole("button", { name: "Confirmar remoção da cor" }).click();
    for (const width of [320, 390, 768, 1440]) { await page.setViewportSize({ width, height: 900 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); }
    await page.screenshot({ path: testInfo.outputPath("manager-colors.png"), fullPage: true });
    const updated = page.waitForResponse(r => r.url().endsWith(`/api/produtos/${id}`) && r.request().method() === "PUT");
    await page.getByRole("button", { name: "Salvar produto" }).click(); const saved = await (await updated).json();
    expect(saved.colors.map((c: any) => c.id)).toEqual(product.colors.slice(0, 2).map((c: any) => c.id));
    expect(saved.colors[1].variants[0].id).toBe(product.colors[1].variants[0].id); expect(saved.colors[1].variants[0].stock).toBe(7);
  } finally { if (id) await page.request.delete(`/api/produtos/${id}`, { headers }); }
});

test("catalog/details switch images and sizes; multi-color guest cart merges and survives login", async ({ page }) => {
  await images(page);
  const admin = (await (await page.request.post("/api/auth/login", { data: { email: process.env.E2E_ADMIN_EMAIL, password: process.env.E2E_ADMIN_PASSWORD } })).json()).accessToken;
  const customer = (await (await page.request.post("/api/auth/login", { data: { email: process.env.E2E_USER_EMAIL, password: process.env.E2E_USER_PASSWORD } })).json()).accessToken;
  const userHeaders = { Authorization: `Bearer ${customer}` }, headers = { Authorization: `Bearer ${admin}` };
  await page.request.delete("/api/carrinho", { headers: userHeaders });
  const name = "Compra multicor " + randomUUID();
  const response = await page.request.post("/api/produtos", {
    headers, data: {
      name, price: 99.9, public: "unissex", categoryId: (await (await page.request.get("/api/categorias", { headers: headers })).json()).find((c: { name: string }) => c.name === "camisetas").id, colors: [
        { colorName: "Preto", colorValue: "#111111", images: ["/colors-black.svg", "/colors-black-back.svg"], variants: [{ value: "P", stock: 3 }, { value: "GG", stock: 0 }] },
        { colorName: "Branco", colorValue: "#FFFFFF", images: ["/colors-white.svg"], variants: [{ value: "P", stock: 0 }, { value: "GG", stock: 1 }] }
      ]
    }
  });
  expect(response.status()).toBe(201); const product = await response.json();
  const card = page.locator("main div.group").filter({ has: page.getByText(name, { exact: true }) });
  try {
    await page.goto("/");
    await card.getByRole("button", { name: "P", exact: true }).click();
    await card.evaluate(el => window.scrollTo(0, window.scrollY + el.getBoundingClientRect().top - 120));
    await card.getByRole("img").hover();
    await card.getByRole("button", { name: "Próxima imagem" }).click();
    await expect(card.getByRole("img", { name, exact: true })).toHaveAttribute("src", "/colors-black-back.svg");
    await card.getByRole("button", { name: "Branco", exact: true }).click();
    await expect(card.getByRole("button", { name: "Branco", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(card.getByRole("img", { name, exact: true })).toHaveAttribute("src", "/colors-white.svg");
    await expect(card.getByRole("button", { name: "P", exact: true })).toBeDisabled();
    await expect(card.getByRole("button", { name: "Selecione o tamanho" })).toBeDisabled();
    await card.getByRole("button", { name: "GG", exact: true }).click(); await card.getByRole("button", { name: "Adicionar ao carrinho", exact: true }).click();
    await expect(card.getByRole("button", { name: "GG", exact: true })).toBeDisabled();
    await card.getByRole("button", { name: "Preto", exact: true }).click();
    await expect(card.getByRole("img", { name, exact: true })).toHaveAttribute("src", "/colors-black.svg");
    await card.getByRole("button", { name: "P", exact: true }).click(); await card.getByRole("button", { name: "Adicionar ao carrinho", exact: true }).click();
    await page.reload(); await page.getByRole("button", { name: "Abrir carrinho" }).click();
    await expect(page.getByRole("button", { name: "Remover item" })).toHaveCount(2);
    const local = await page.evaluate(() => JSON.parse(localStorage.getItem("brecho_guest_cart_v2")!));
    expect(new Set(local.map((i: any) => i.colorId)).size).toBe(2);
    await page.keyboard.press("Escape"); await login(page);
    await expect(page.getByRole("status")).toContainText("Carrinho de visitante sincronizado");
    await card.evaluate(element => window.scrollTo(0, window.scrollY + element.getBoundingClientRect().top - 120)); await card.getByRole("img").hover(); await card.getByRole("button", { name: "Favoritar", exact: true }).click();
    await expect(card.getByRole("button", { name: "Remover dos favoritos" })).toBeVisible();
    await card.getByRole("button", { name: "Branco", exact: true }).click();
    await expect(card.getByRole("button", { name: "Remover dos favoritos" })).toBeVisible();
    await page.getByRole("button", { name: "Cliente", exact: true }).click(); await page.getByRole("button", { name: "Sair", exact: true }).click();
    await login(page); await page.reload();
    const saved = (await (await page.request.get("/api/carrinho", { headers: userHeaders })).json()).items;
    expect(saved.map((i: any) => [i.colorId, i.size, i.quantity])).toEqual([[product.colors[0].id, "P", 1], [product.colors[1].id, "GG", 1]]);
    await page.goto(`/?productId=${product.id}`);
    const detail = page.locator(".store-product-detail-content");
    await detail.getByRole("button", { name: "P", exact: true }).click();
    await detail.getByRole("button", { name: "Branco", exact: true }).click();
    await expect(detail.getByRole("button", { name: "Selecione o tamanho" })).toBeDisabled();
    await expect(page.getByRole("img", { name, exact: true })).toHaveAttribute("src", "/colors-white.svg");
    await expect(detail.getByRole("button", { name: "P", exact: true })).toBeDisabled();
  } finally { await page.request.delete(`/api/produtos/${product.id}`, { headers }); }
});

test("switching manager color aborts a pending eyedropper and ignores its late result", async ({ page }) => {
  await images(page);
  await page.addInitScript(() => Object.defineProperty(window, "EyeDropper", {
    configurable: true, value: class {
      open() { return new Promise(resolve => { (window as any).finishColor = () => resolve({ sRGBHex: "#ff0000" }); }); }
    }
  }));
  await page.goto("/manager"); await login(page, true);
  await page.getByRole("link", { name: "Produtos", exact: true }).click(); await page.getByRole("link", { name: "Novo produto" }).click();
  await page.getByLabel("Nome da cor", { exact: true }).fill("Preto"); await page.getByLabel("Valor da cor", { exact: true }).fill("#111111");
  await page.getByLabel("Imagem principal", { exact: true }).fill("/colors-black.svg");
  await page.getByRole("button", { name: "Selecionar na imagem" }).click();
  await expect(page.getByRole("button", { name: "Selecionando..." })).toBeDisabled();
  await page.getByRole("button", { name: "+ Adicionar cor", exact: true }).click();
  await page.getByLabel("Nome da cor", { exact: true }).fill("Branco"); await page.getByLabel("Valor da cor", { exact: true }).fill("#ffffff");
  await page.evaluate(() => (window as any).finishColor());
  await expect(page.getByLabel("Valor da cor", { exact: true })).toHaveValue("#FFFFFF");
  await page.getByRole("group", { name: "Cores do produto", exact: true }).getByRole("button", { name: "Preto", exact: true }).click();
  await expect(page.getByLabel("Valor da cor", { exact: true })).toHaveValue("#111111");
});

test("legacy guest cart gains the original color and all-color size filters keep the product unique", async ({ page }) => {
  const product = {
    id: 99991, name: "Legacy multicor", price: "10", public: "unissex", category: "camisetas", colors: [
      { id: 99992, colorName: "Preto", colorValue: "#111111", images: [], variants: [{ id: 99994, value: "P", stock: 3 }] },
      { id: 99993, colorName: "Branco", colorValue: "#FFFFFF", images: [], variants: [{ id: 99995, value: "GG", stock: 1 }, { id: 99996, value: "36", stock: 0 }] }
    ]
  };
  await page.addInitScript(() => { if (!localStorage.getItem("brecho_guest_cart_v2")) localStorage.setItem("brecho_guest_cart_v2", JSON.stringify([{ product: { id: 99991 }, size: "P", quantity: 2 }])); });
  await page.route("**/api/produtos{,/admin}", route => route.fulfill({ json: [product] }));
  await page.goto("/");
  const sizes = page.locator("aside section").first();
  await expect(sizes.locator("button[aria-pressed]")).toHaveText(["P", "GG"]);
  await sizes.getByRole("button", { name: "GG", exact: true }).click();
  await expect(page.getByText("1 peça encontrada", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Abrir carrinho" }).click();
  await expect(page.getByRole("button", { name: "Remover item" })).toHaveCount(1);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("brecho_guest_cart_v2")!));
  expect(stored[0].colorId).toBe(99992); expect(stored[0].quantity).toBe(2);
});
