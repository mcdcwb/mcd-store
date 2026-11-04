import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";

const image = "https://res.cloudinary.com/test/image/upload/v1/mcd-store-demo/products/local.png";
async function start(page: Page) {
  await page.goto("/manager"); await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.getByLabel("E-mail", { exact: true }).fill(process.env.E2E_ADMIN_EMAIL!);
  await page.getByLabel("Senha", { exact: true }).fill(process.env.E2E_ADMIN_PASSWORD!);
  await page.locator('form button[type="submit"]').click();
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Produtos", exact: true }).click(); await page.getByRole("link", { name: "Novo produto" }).click();
}
async function selectFile(page: Page) {
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Selecionar imagem", exact: true }).click();
  await (await chooser).setFiles("tests/fixtures/product-upload.png");
}
const tabs = (page: Page) => page.getByRole("group", { name: "Cores do produto", exact: true });

test("native chooser focus preserves an unsaved color and its pending upload", async ({ page }) => {
  await page.route("https://res.cloudinary.com/**", route => route.fulfill({ path: "tests/fixtures/product-upload.png", contentType: "image/png" }));
  let release!: () => void;
  await page.route("**/api/uploads/produtos", async route => {
    await new Promise<void>(resolve => { release = resolve; });
    await route.fulfill({ status: 201, json: { url: image } });
  });
  await start(page);
  await page.getByLabel("Nome", { exact: true }).fill("Rascunho preservado");
  await page.getByLabel("Nome da cor", { exact: true }).fill("Preto");
  await page.getByRole("button", { name: "+ Adicionar cor", exact: true }).click();
  await page.getByLabel("Nome da cor", { exact: true }).fill("Branco");
  const chooserReady = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Selecionar imagem", exact: true }).click();
  const chooser = await chooserReady;
  // setFiles does not reproduce the native Windows dialog's return-of-focus event.
  const revalidated = page.waitForResponse(r => r.url().endsWith("/api/auth/me"));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await revalidated;
  await expect(page.getByLabel("Nome da cor", { exact: true })).toHaveValue("Branco");
  await chooser.setFiles("tests/fixtures/product-upload.png");
  await expect.poll(() => typeof release).toBe("function");
  const secondCheck = page.waitForResponse(r => r.url().endsWith("/api/auth/me"));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await secondCheck;
  await tabs(page).getByRole("button", { name: "Preto", exact: true }).click();
  release();
  await expect(page.getByRole("button", { name: "Selecionar imagem", exact: true })).toBeEnabled();
  await expect(page.getByLabel("Nome", { exact: true })).toHaveValue("Rascunho preservado");
  await expect(page.getByLabel("Imagem principal", { exact: true })).toHaveValue("");
  await tabs(page).getByRole("button", { name: "Branco", exact: true }).click();
  await expect(page.getByRole("img", { name: "Prévia do produto", exact: true })).toHaveAttribute("src", image);
  await expect(page.getByRole("status").filter({ hasText: "Imagem enviada" })).toBeVisible();
});

test("a rejected upload stays visible after focus revalidation and switching colors", async ({ page }) => {
  let release!: () => void;
  await page.route("**/api/uploads/produtos", async route => {
    await new Promise<void>(resolve => { release = resolve; });
    await route.fulfill({ status: 502, json: { error: "Não foi possível enviar a imagem. Tente novamente." } });
  });
  await start(page);
  await page.getByLabel("Nome da cor", { exact: true }).fill("Preto");
  await page.getByRole("button", { name: "+ Adicionar cor", exact: true }).click();
  await page.getByLabel("Nome da cor", { exact: true }).fill("Branco");
  await selectFile(page);
  await expect.poll(() => typeof release).toBe("function");
  await tabs(page).getByRole("button", { name: "Preto", exact: true }).click();
  release();
  await expect(page.getByRole("alert")).toContainText("Branco");
  const revalidated = page.waitForResponse(r => r.url().endsWith("/api/auth/me"));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await revalidated;
  await expect(page.getByRole("alert")).toContainText("Não foi possível enviar a imagem");
  await expect(page.getByLabel("Imagem principal", { exact: true })).toHaveValue("");
});

for (const scenario of ["create", "create-switch", "edit", "real"]) test(`new unsaved ProductColor: add color then local upload (${scenario})`, async ({ page }, info) => {
  const real = scenario === "real";
  const switchColor = scenario === "edit" || scenario === "create-switch";
  test.skip(real && process.env.E2E_REAL_UPLOAD !== "1", "Explicit real-upload opt-in required");
  test.setTimeout(120000);
  let release!: () => void;
  if (!real) {
    await page.route("https://res.cloudinary.com/**", route => route.fulfill({ path: "tests/fixtures/product-upload.png", contentType: "image/png" }));
    await page.route("**/api/uploads/produtos", async route => {
      await new Promise<void>(resolve => { release = resolve; });
      await route.fulfill({ status: 201, json: { url: image } });
    });
  }
  await start(page);
  const headers = { Authorization: `Bearer ${await page.evaluate(() => JSON.parse(localStorage.getItem("mcd-store_auth_v1")!).accessToken)}` };
  const name = "New color upload " + randomUUID();
  let id: number | undefined;
  try {
    await page.getByLabel("Nome", { exact: true }).fill(name);
    await page.getByLabel("Preço (R$)").fill("50");
    await page.getByLabel("Nome da cor", { exact: true }).fill("Preto");
    await page.getByLabel("Valor da cor", { exact: true }).fill("#111111");
    await page.getByLabel("Imagem principal", { exact: true }).fill("/tests/fixtures/product-upload.webp");
    await page.getByLabel("Variante 1", { exact: true }).fill("P");
    await page.getByLabel("Estoque 1", { exact: true }).fill("2");
    if (scenario === "edit") {
      const saved = page.waitForResponse(r => r.url().endsWith("/api/produtos") && r.request().method() === "POST");
      await page.getByRole("button", { name: "Salvar produto" }).click();
      id = (await (await saved).json()).id;
      await expect(page.getByRole("heading", { name: "Produtos", exact: true })).toBeVisible();
      await page.goto(`/manager/produtos/${id}/editar`);
    }
    await page.getByRole("button", { name: "+ Adicionar cor", exact: true }).click();
    await expect(tabs(page).getByRole("button", { name: "Cor 2", exact: true })).toHaveAttribute("aria-pressed", "true");
    const preview = page.getByRole("img", { name: "Prévia do produto", exact: true });
    const fallback = await preview.getAttribute("src");
    const uploaded = page.waitForResponse(r => r.url().endsWith("/api/uploads/produtos") && r.request().method() === "POST", { timeout: 75000 });
    await selectFile(page);
    if (!real) {
      await expect.poll(() => typeof release).toBe("function");
      if (switchColor) await tabs(page).getByRole("button", { name: "Preto", exact: true }).click();
      release();
    }
    const response = await uploaded;
    expect(response.status()).toBe(201);
    const { url } = await response.json();
    expect(new URL(url).protocol).toBe("https:");
    await expect(page.getByRole("button", { name: "Selecionar imagem", exact: true })).toBeEnabled();
    if (switchColor) {
      await expect(page.getByLabel("Imagem principal", { exact: true })).toHaveValue("/tests/fixtures/product-upload.webp");
      await tabs(page).getByRole("button", { name: "Cor 2", exact: true }).click();
    }
    await expect(page.getByLabel("Imagem principal", { exact: true })).toHaveValue(url);
    await expect(preview).toHaveAttribute("src", url);
    expect(await preview.getAttribute("src")).not.toBe(fallback);
    await expect.poll(() => preview.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    await page.getByLabel("Nome da cor", { exact: true }).fill("Branco");
    await page.getByLabel("Valor da cor", { exact: true }).fill("#ffffff");
    await page.getByLabel("Variante 1", { exact: true }).fill("M");
    await page.getByLabel("Estoque 1", { exact: true }).fill("3");
    const saved = page.waitForResponse(r => r.url().endsWith(id ? `/api/produtos/${id}` : "/api/produtos") && r.request().method() === (id ? "PUT" : "POST"));
    await page.getByRole("button", { name: "Salvar produto" }).click();
    const savedResponse = await saved;
    expect(savedResponse.status()).toBe(id ? 200 : 201);
    const body = savedResponse.request().postDataJSON();
    expect(body.colors[1].id).toBeUndefined();
    if (scenario === "create-switch") expect(body.colors[0].id).toBeUndefined();
    const product = await savedResponse.json(); id = product.id;
    expect(product.colors.map((color: any) => color.imageUrl)).toEqual(["/tests/fixtures/product-upload.webp", url]);
    await expect(page.getByRole("heading", { name: "Produtos", exact: true })).toBeVisible();
    await page.goto(`/manager/produtos/${id}/editar`);
    await expect(page.getByRole("heading", { name: "Editar produto", exact: true })).toBeVisible();
    await page.reload();
    await tabs(page).getByRole("button", { name: "Branco", exact: true }).click();
    await expect(preview).toHaveAttribute("src", url);
    await expect(page.getByLabel("Estoque 1", { exact: true })).toHaveValue("3");
    await page.goto("/");
    const card = page.locator("main div.group").filter({ has: page.getByText(name, { exact: true }) });
    await expect(card.getByRole("img", { name, exact: true })).toHaveAttribute("src", "/tests/fixtures/product-upload.webp");
    await card.getByRole("button", { name: "Branco", exact: true }).click();
    await expect(card.getByRole("img", { name, exact: true })).toHaveAttribute("src", url);
    await page.goto(`/?productId=${id}`);
    await expect(page.getByRole("heading", { name, exact: true, level: 1 })).toBeVisible();
    await page.getByRole("button", { name: "Branco", exact: true }).click();
    await expect(page.getByRole("img", { name, exact: true })).toHaveAttribute("src", url);
    await info.attach("unsaved-color-upload-result", {
      body: JSON.stringify({
        scenario, method: response.request().method(), status: response.status(), url,
        sourceColorHadNoId: body.colors[1].id === undefined, switchedDuringUpload: switchColor,
        preview: true, saved: true, reload: true, catalog: true, details: true, colorIsolation: true
      }),
      contentType: "application/json"
    });
  } finally { if (id) await page.request.delete(`/api/produtos/${id}`, { headers }); }
});

test("uploads follow their source color through create/edit, retain URL images, persist and render in catalog", async ({ page }, info) => {
  await page.route("https://res.cloudinary.com/**", route => route.fulfill({ path: "tests/fixtures/product-upload.png", contentType: "image/png" }));
  let finish!: () => void;
  await page.route("**/api/uploads/produtos", async route => {
    expect(route.request().headers()["authorization"]).toMatch(/^Bearer /);
    expect(route.request().headers()["content-type"]).toContain("multipart/form-data; boundary=");
    await new Promise<void>(resolve => { finish = resolve; });
    await route.fulfill({ status: 201, json: { url: image } });
  });
  await start(page);
  const headers = { Authorization: `Bearer ${await page.evaluate(() => JSON.parse(localStorage.getItem("mcd-store_auth_v1")!).accessToken)}` };
  let id: number | undefined;
  const name = "Upload " + randomUUID();
  try {
    await page.getByLabel("Nome", { exact: true }).fill(name); await page.getByLabel("Preço (R$)").fill("50");
    await page.getByLabel("Nome da cor", { exact: true }).fill("Preto"); await page.getByLabel("Valor da cor", { exact: true }).fill("#111111");
    await page.getByLabel("Variante 1", { exact: true }).fill("P"); await page.getByLabel("Estoque 1", { exact: true }).fill("2");
    await selectFile(page);
    await expect(page.getByRole("button", { name: "Enviando imagem...", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Salvar produto" })).toBeDisabled();
    await page.getByRole("button", { name: "+ Adicionar cor", exact: true }).click();
    await page.getByLabel("Nome da cor", { exact: true }).fill("Branco"); await page.getByLabel("Valor da cor", { exact: true }).fill("#ffffff");
    await page.getByLabel("Variante 1", { exact: true }).fill("M"); await page.getByLabel("Estoque 1", { exact: true }).fill("3");
    await page.getByLabel("Imagem principal", { exact: true }).fill("/tests/fixtures/product-upload.webp");
    finish(); await expect(page.getByRole("button", { name: "Selecionar imagem", exact: true })).toBeEnabled();
    await expect(page.getByLabel("Imagem principal", { exact: true })).toHaveValue("/tests/fixtures/product-upload.webp");
    await tabs(page).getByRole("button", { name: "Preto", exact: true }).click();
    await expect(page.getByLabel("Imagem principal", { exact: true })).toHaveValue(image);
    await expect(page.getByRole("img", { name: "Prévia do produto", exact: true })).toHaveAttribute("src", image);
    const created = page.waitForResponse(r => r.url().endsWith("/api/produtos") && r.request().method() === "POST");
    await page.getByRole("button", { name: "Salvar produto" }).click(); const response = await created; expect(response.status()).toBe(201);
    const product = await response.json(); id = product.id;
    expect(product.colors.map((c: any) => c.imageUrl)).toEqual([image, "/tests/fixtures/product-upload.webp"]);
    await page.goto(`/manager/produtos/${id}/editar`);
    await tabs(page).getByRole("button", { name: "Branco", exact: true }).click();
    await selectFile(page); await expect(page.getByRole("button", { name: "Enviando imagem...", exact: true })).toBeDisabled(); finish();
    await expect(page.getByRole("textbox", { name: "Imagens adicionais", exact: true })).toHaveValue(image);
    await expect(page.getByRole("img", { name: "Imagem 2 de Branco", exact: true })).toHaveAttribute("src", image);
    // Uploading the same returned asset again does not duplicate its reference.
    await selectFile(page); await expect(page.getByRole("button", { name: "Enviando imagem...", exact: true })).toBeDisabled(); finish();
    await expect(page.getByRole("button", { name: "Selecionar imagem", exact: true })).toBeEnabled();
    await expect(page.getByRole("textbox", { name: "Imagens adicionais", exact: true })).toHaveValue(image);
    await page.getByRole("textbox", { name: "Imagens adicionais", exact: true }).fill(image + "\n/tests/fixtures/product-upload.webp");
    // Existing URL removal behavior remains editing/clearing the URL fields.
    await page.getByLabel("Imagem principal", { exact: true }).fill("");
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`upload-${width}.png`), fullPage: true });
    }
    const updated = page.waitForResponse(r => r.url().endsWith(`/api/produtos/${id}`) && r.request().method() === "PUT");
    await page.getByRole("button", { name: "Salvar produto" }).click(); expect((await updated).status()).toBe(200);
    await page.goto(`/manager/produtos/${id}/editar`);
    await expect(page.getByRole("heading", { name: "Editar produto", exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Imagem principal", { exact: true })).toHaveValue(image);
    await tabs(page).getByRole("button", { name: "Branco", exact: true }).click();
    await expect(page.getByLabel("Imagem principal", { exact: true })).toHaveValue("");
    await expect(page.getByRole("textbox", { name: "Imagens adicionais", exact: true })).toHaveValue(image + "\n/tests/fixtures/product-upload.webp");
    await page.goto(`/?productId=${id}`);
    await expect(page.getByRole("heading", { name, exact: true, level: 1 })).toBeVisible();
    await expect(page.getByRole("img", { name, exact: true })).toHaveAttribute("src", image);
    await page.getByRole("button", { name: "Branco", exact: true }).click();
    await expect(page.getByRole("img", { name, exact: true })).toHaveAttribute("src", image);
  } finally { if (id) await page.request.delete(`/api/produtos/${id}`, { headers }); }
});

test("upload errors preserve images and cancelling/removing the source discards a pending result", async ({ page }) => {
  await start(page);
  await page.getByLabel("Nome da cor", { exact: true }).fill("Preto");
  await page.getByLabel("Imagem principal", { exact: true }).fill("/existing.png");
  await page.route("**/api/uploads/produtos", route => route.fulfill({ status: 502, json: { error: "Não foi possível enviar a imagem. Tente novamente." } }));
  await selectFile(page); await expect(page.getByRole("alert")).toContainText("Não foi possível enviar");
  await expect(page.getByLabel("Imagem principal", { exact: true })).toHaveValue("/existing.png");
  await expect(page.getByRole("textbox", { name: "Imagens adicionais", exact: true })).toHaveValue("");
  await page.unroute("**/api/uploads/produtos");
  let finish!: () => void;
  await page.route("**/api/uploads/produtos", async route => { await new Promise<void>(resolve => { finish = resolve; }); await route.fulfill({ status: 201, json: { url: image } }).catch(() => { }); });
  await selectFile(page); await expect(page.getByRole("button", { name: "Enviando imagem...", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "+ Adicionar cor", exact: true }).click();
  await page.getByLabel("Nome da cor", { exact: true }).fill("Branco");
  await tabs(page).getByRole("button", { name: "Preto", exact: true }).click();
  await page.getByRole("button", { name: "Remover cor", exact: true }).click(); await page.getByRole("button", { name: "Confirmar remoção da cor" }).click();
  finish(); await expect(page.getByRole("button", { name: "Selecionar imagem", exact: true })).toBeEnabled();
  await expect(page.getByLabel("Nome da cor", { exact: true })).toHaveValue("Branco");
  await expect(page.getByLabel("Imagem principal", { exact: true })).toHaveValue("");
  await selectFile(page); await expect(page.getByRole("button", { name: "Enviando imagem...", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Cancelar", exact: true }).click(); finish();
  await page.getByRole("link", { name: "Novo produto" }).click();
  await expect(page.getByLabel("Imagem principal", { exact: true })).toHaveValue("");
});

for (const status of [401, 403]) test(`upload ${status} revokes manager access`, async ({ page }) => {
  await start(page);
  await page.route("**/api/uploads/produtos", route => route.fulfill({ status, json: { error: "Acesso negado" } }));
  await selectFile(page);
  await expect(page.getByRole("heading", { name: "Acesso administrativo", exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("mcd-store_auth_v1"))).toBeNull();
});

// Explicitly opt in: this leaves one remote asset and never runs in the normal suite.
test("real Cloudinary upload through manager persists after reload and renders in catalog", async ({ page }, info) => {
  test.skip(process.env.E2E_REAL_UPLOAD !== "1", "Requires explicit opt-in and configured backend credentials");
  test.setTimeout(120000);
  await start(page);
  const headers = { Authorization: `Bearer ${await page.evaluate(() => JSON.parse(localStorage.getItem("mcd-store_auth_v1")!).accessToken)}` };
  let id: number | undefined;
  const name = "Cloudinary validation " + randomUUID();
  try {
    await page.getByLabel("Nome", { exact: true }).fill(name); await page.getByLabel("Preço (R$)").fill("50");
    await page.getByLabel("Nome da cor", { exact: true }).fill("Preto"); await page.getByLabel("Valor da cor", { exact: true }).fill("#111111");
    await page.getByLabel("Variante 1", { exact: true }).fill("P"); await page.getByLabel("Estoque 1", { exact: true }).fill("1");
    const uploaded = page.waitForResponse(r => r.url().endsWith("/api/uploads/produtos"), { timeout: 75000 });
    await selectFile(page);
    const response = await uploaded; expect(response.status()).toBe(201);
    const data = await response.json(); expect(Object.keys(data)).toEqual(["url"]);
    const imageUrl = new URL(data.url);

    expect(imageUrl.hostname).toBe("res.cloudinary.com");
    expect(imageUrl.pathname).toContain("/image/upload/");
    expect(imageUrl.pathname).toContain("/mcd-store-demo/products/");
    const preview = page.getByRole("img", { name: "Prévia do produto", exact: true });
    await expect(preview).toHaveAttribute("src", data.url);
    await expect.poll(() => preview.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    await page.getByRole("button", { name: "+ Adicionar cor", exact: true }).click();
    await page.getByLabel("Nome da cor", { exact: true }).fill("Branco"); await page.getByLabel("Valor da cor", { exact: true }).fill("#ffffff");
    await page.getByLabel("Imagem principal", { exact: true }).fill("/tests/fixtures/product-upload.webp");
    await page.getByLabel("Variante 1", { exact: true }).fill("M"); await page.getByLabel("Estoque 1", { exact: true }).fill("1");
    const created = page.waitForResponse(r => r.url().endsWith("/api/produtos") && r.request().method() === "POST");
    await page.getByRole("button", { name: "Salvar produto" }).click();
    const saved = await created; expect(saved.status()).toBe(201); const product = await saved.json(); id = product.id;
    expect(product.colors.map((color: any) => color.imageUrl)).toEqual([data.url, "/tests/fixtures/product-upload.webp"]);
    await expect(page.getByRole("heading", { name: "Produtos", exact: true })).toBeVisible();
    await page.goto(`/manager/produtos/${id}/editar`);
    await expect(page.getByRole("heading", { name: "Editar produto", exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Imagem principal", { exact: true })).toHaveValue(data.url);
    await expect(preview).toHaveAttribute("src", data.url);
    await page.getByRole("textbox", { name: "Imagens adicionais", exact: true }).fill("/tests/fixtures/product-upload.webp");
    await page.screenshot({ path: info.outputPath("real-cloudinary-manager.png"), fullPage: true });
    const updated = page.waitForResponse(r => r.url().endsWith(`/api/produtos/${id}`) && r.request().method() === "PUT");
    await page.getByRole("button", { name: "Salvar produto" }).click(); expect((await updated).status()).toBe(200);
    await expect(page.getByRole("heading", { name: "Produtos", exact: true })).toBeVisible();
    await page.goto("/");
    const card = page.locator("main div.group").filter({ has: page.getByText(name, { exact: true }) });
    const catalogImage = card.getByRole("img", { name, exact: true });
    await expect(catalogImage).toHaveAttribute("src", data.url);
    await expect.poll(() => catalogImage.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    await card.getByRole("button", { name: "Branco", exact: true }).click();
    await expect(catalogImage).toHaveAttribute("src", "/tests/fixtures/product-upload.webp");
    await card.getByRole("button", { name: "Preto", exact: true }).click();
    await expect(catalogImage).toHaveAttribute("src", data.url);
    await page.goto(`/?productId=${id}`);
    await expect(page.getByRole("heading", { name, exact: true, level: 1 })).toBeVisible();
    await expect(page.getByRole("img", { name, exact: true })).toHaveAttribute("src", data.url);
    await page.screenshot({ path: info.outputPath("real-cloudinary-details.png"), fullPage: true });
    await info.attach("cloudinary-result", { body: JSON.stringify({ url: data.url, created: true, edited: true, reload: true, catalog: true, colorIsolation: true, remoteAssetRetained: true }), contentType: "application/json" });
  } finally { if (id) await page.request.delete(`/api/produtos/${id}`, { headers }); }
});
