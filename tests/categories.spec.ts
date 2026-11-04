import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";

async function login(page: Page) {
  await page.goto("/manager");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.getByLabel("E-mail", { exact: true }).fill(process.env.E2E_ADMIN_EMAIL!);
  await page.getByLabel("Senha", { exact: true }).fill(process.env.E2E_ADMIN_PASSWORD!);
  await page.locator('form button[type="submit"]').click();
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
}

async function expectOnlyCategoryError(page: Page, message: string) {
  await expect(page.locator('[data-sonner-toast][data-type="error"]').filter({ hasText: message })).toHaveCount(1);
  await expect(page.locator('main [role="alert"]')).toHaveCount(0);
  await expect(page.getByRole("alertdialog").getByRole("alert")).toHaveCount(0);
  await expect(page.locator("main").getByText("Atualizar lista", { exact: true })).toHaveCount(0);
}

for (const width of [1440, 768, 390, 320]) test(`Settings lists all categories, counts and synchronizes category CRUD at ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 1000 });
  const response = await page.request.post("/api/auth/login", { data: { email: process.env.E2E_ADMIN_EMAIL, password: process.env.E2E_ADMIN_PASSWORD } });
  const headers = { Authorization: `Bearer ${(await response.json()).accessToken}` };
  const prefix = "Settings " + randomUUID(), emptyName = prefix + " Vazia", usedName = prefix + " Utilizada";
  const ids: number[] = []; let product: any;
  try {
    for (const name of [emptyName, usedName]) ids.push((await (await page.request.post("/api/categorias", { headers, data: { name } })).json()).id);
    product = await (await page.request.post("/api/produtos", {
      headers, data: {
        name: prefix, price: 30, public: "unissex", categoryId: ids[1], isPublished: false,
        colors: [{ colorName: "Preto", colorValue: "#111111", images: ["/settings.png"], variants: [{ value: "M", stock: 0 }] }]
      }
    })).json();
    await login(page); await page.getByRole("link", { name: "Configurações", exact: true }).click();
    const section = page.getByRole("region", { name: "Categorias de produtos", exact: true });
    const row = (name: string) => section.getByRole("button", { name: `Editar ${name}`, exact: true }).locator("..");
    await expect(row(emptyName)).toContainText("0 produtos"); await expect(row(usedName)).toContainText("1 produto");
    const threshold = page.getByLabel("Limite de estoque baixo");
    const unsaved = String(Number(await threshold.inputValue()) + 1); await threshold.fill(unsaved);
    const input = section.getByLabel("Nova categoria", { exact: true });
    const createdName = prefix + " Nova";
    await input.fill(` ${createdName} `); await section.getByRole("button", { name: "Adicionar", exact: true }).click();
    await expect(row(createdName)).toContainText("0 produtos"); await expect(input).toHaveValue("");
    ids.push((await (await page.request.get("/api/categorias", { headers })).json()).find((c: any) => c.name === createdName).id);
    await expect(threshold).toHaveValue(unsaved);
    await input.fill(createdName.toUpperCase()); await section.getByRole("button", { name: "Adicionar", exact: true }).click();
    await expect(page.locator('[data-sonner-toast][data-type="error"]').last()).toContainText("Já existe");
    await expectOnlyCategoryError(page, "Já existe");
    await expect(input).toHaveValue(createdName.toUpperCase()); await input.fill("");
    const originalHeight = (await row(usedName).boundingBox())!.height;
    await section.getByRole("button", { name: `Editar ${usedName}`, exact: true }).click();
    const editingHeight = (await section.getByLabel("Renomear categoria").locator("../..").boundingBox())!.height;
    expect(Math.abs(editingHeight - originalHeight)).toBeLessThan(80);
    await expect(section.getByRole("button", { name: "Salvar", exact: true })).toBeDisabled();
    await section.getByLabel("Renomear categoria").fill(usedName + " Cancelada");
    await section.getByRole("button", { name: "Cancelar", exact: true }).click();
    await expect(row(usedName)).toContainText("1 produto");
    await section.getByRole("button", { name: `Editar ${usedName}`, exact: true }).click();
    await section.getByLabel("Renomear categoria").fill(usedName + " Editada");
    await section.getByRole("button", { name: "Salvar", exact: true }).click();
    await expect(row(usedName + " Editada")).toContainText("1 produto");
    const persisted = (await (await page.request.get("/api/produtos/admin", { headers })).json()).find((p: any) => p.id === product.id);
    expect(persisted.categoryId).toBe(ids[1]); expect(persisted.colors).toEqual(product.colors);
    await section.getByRole("button", { name: `Excluir ${usedName} Editada`, exact: true }).click();
    await page.getByRole("button", { name: "Confirmar exclusão de categoria" }).click();
    await expectOnlyCategoryError(page, "existem produtos associados");
    await page.getByRole("alertdialog").getByRole("button", { name: "Cancelar", exact: true }).click();
    await section.getByRole("button", { name: `Excluir ${emptyName}`, exact: true }).click();
    await page.getByRole("button", { name: "Confirmar exclusão de categoria" }).click();
    await expect(section.getByRole("button", { name: `Editar ${emptyName}`, exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`settings-categories-${width}.png`), fullPage: true });
    await page.getByRole("link", { name: "Produtos", exact: true }).click();
    await expect(page.getByLabel("Categoria", { exact: true }).locator(`option[value="${ids[1]}"]`)).toHaveText(usedName + " Editada");
    await page.getByRole("article", { name: prefix, exact: true }).getByRole("link", { name: "Editar", exact: true }).click();
    await expect(page.getByLabel("Categoria", { exact: true }).locator("option:checked")).toHaveText(usedName + " Editada");
    await page.getByRole("button", { name: "Cancelar", exact: true }).click();
    await page.getByRole("link", { name: "Novo produto" }).click();
    await expect(page.getByLabel("Categoria", { exact: true }).locator(`option[value="${ids[2]}"]`)).toHaveText(createdName);
    await page.getByRole("button", { name: "Cancelar", exact: true }).click();
    await page.getByRole("link", { name: "Ver loja", exact: true }).click();
    await expect(page.locator("aside section").nth(2).getByRole("button", { name: usedName + " Editada", exact: true })).toHaveCount(0);
  } finally {
    if (product?.id) await page.request.delete(`/api/produtos/${product.id}`, { headers });
    for (const id of ids) await page.request.delete(`/api/categorias/${id}`, { headers });
  }
});

test("Settings category editor retains failures and blocks repeated submissions", async ({ page }) => {
  await login(page); await page.getByRole("link", { name: "Configurações", exact: true }).click();
  const section = page.getByRole("region", { name: "Categorias de produtos", exact: true });
  const name = await section.getByRole("button", { name: /^Editar / }).first().getAttribute("aria-label");
  await section.getByRole("button", { name: name!, exact: true }).click();
  const edit = section.getByLabel("Renomear categoria");
  const original = await edit.inputValue(); await edit.fill(original + " Rascunho");
  let release!: () => void; let writes = 0; const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/categorias/*", async route => {
    if (route.request().method() !== "PUT") return route.continue();
    writes++; await gate; await route.fulfill({ status: 500, json: { error: "Falha temporária de categoria." } });
  });
  await edit.press("Enter");
  await expect(section.getByRole("button", { name: "Salvando...", exact: true })).toBeDisabled();
  await edit.dispatchEvent("keydown", { key: "Enter" }); await edit.dispatchEvent("keydown", { key: "Enter" });
  await expect.poll(() => writes).toBe(1); release();
  await expect(section.getByRole("button", { name: "Salvar", exact: true })).toBeEnabled();
  await expect(edit).toHaveValue(original + " Rascunho");
  await expect(page.locator('[data-sonner-toast][data-type="error"]').last()).toContainText("Falha temporária");
  await expectOnlyCategoryError(page, "Falha temporária");
  await edit.fill(" "); await expect(section.getByRole("button", { name: "Salvar", exact: true })).toBeDisabled();
  await edit.press("Enter");
  await expectOnlyCategoryError(page, "Informe o nome da categoria.");
  await edit.fill(original); await expect(section.getByRole("button", { name: "Salvar", exact: true })).toBeDisabled();
  await section.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(section.getByRole("button", { name: name!, exact: true })).toBeVisible();
});

test("Initial category loading failure keeps its retry banner and recovers without an operation toast", async ({ page }) => {
  await login(page);
  let fail = true;
  await page.route("**/api/categorias", route => fail
    ? route.fulfill({ status: 500, json: { error: "Falha ao carregar categorias." } })
    : route.continue());
  await page.goto("/manager/settings");
  await expect(page.locator('main [role="alert"]')).toContainText("Falha ao carregar categorias.");
  await expect(page.getByRole("region", { name: "Categorias de produtos", exact: true })).toHaveCount(0);
  await expect(page.locator('[data-sonner-toast][data-type="error"]')).toHaveCount(0);
  fail = false;
  await page.getByRole("button", { name: "Atualizar lista", exact: true }).click();
  await expect(page.getByRole("region", { name: "Categorias de produtos", exact: true })).toBeVisible();
  await expect(page.locator('main [role="alert"]')).toHaveCount(0);
});

for (const width of [1440, 768, 390, 320]) test(`ADMIN manages categories in settings and product associations at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 }); await login(page);
  const token = await page.evaluate(() => JSON.parse(localStorage.getItem("mcd-store_auth_v1")!).accessToken);
  const headers = { Authorization: `Bearer ${token}` };
  const name = "Acessórios " + randomUUID(), second = "Coleção " + randomUUID();
  const ids: number[] = []; let productId: number | undefined;
  try {
    await page.getByRole("link", { name: "Produtos", exact: true }).click();
    await page.getByRole("link", { name: "Novo produto" }).click();
    await page.getByLabel("Nome", { exact: true }).fill(name);
    await page.getByLabel("Preço (R$)", { exact: true }).fill("25");
    await page.getByLabel("Nome da cor", { exact: true }).fill("Preto");
    await page.getByLabel("Valor da cor", { exact: true }).fill("#111111");
    await page.getByLabel("Variante 1", { exact: true }).fill("P");
    await page.getByLabel("Estoque 1", { exact: true }).fill("3");
    await page.getByRole("button", { name: "+ Nova categoria", exact: true }).click();
    await page.getByLabel("Nova categoria", { exact: true }).fill(`  ${name}  `);
    await page.getByRole("button", { name: "Adicionar", exact: true }).click();
    await expect(page.getByLabel("Categoria", { exact: true }).locator("option:checked")).toHaveText(name);
    const id = Number(await page.getByLabel("Categoria", { exact: true }).inputValue()); ids.push(id);
    await expect(page.getByLabel("Nome", { exact: true })).toHaveValue(name);
    const created = page.waitForResponse(r => r.url().endsWith("/api/produtos") && r.request().method() === "POST");
    await page.getByRole("button", { name: "Salvar produto", exact: true }).click();
    const result = await (await created).json(); productId = result.id; expect(result.categoryId).toBe(id);
    await expect(page.getByLabel("Categoria", { exact: true }).locator("option")).toContainText([name]);
    await expect(page.getByRole("button", { name: "Gerenciar categorias", exact: true })).toHaveCount(0);
    await page.getByRole("link", { name: "Configurações", exact: true }).click();
    await page.getByRole("button", { name: `Editar ${name}`, exact: true }).click();
    await page.getByLabel("Renomear categoria", { exact: true }).fill(name + " Editada");
    await page.getByRole("button", { name: "Salvar", exact: true }).click();
    await expect(page.getByRole("button", { name: `Editar ${name} Editada`, exact: true })).toBeVisible();
    await page.getByRole("button", { name: `Excluir ${name} Editada`, exact: true }).click();
    await page.getByRole("button", { name: "Confirmar exclusão de categoria" }).click();
    await expectOnlyCategoryError(page, "existem produtos associados");
    await page.getByRole("alertdialog").getByRole("button", { name: "Cancelar", exact: true }).click();
    await page.getByRole("link", { name: "Produtos", exact: true }).click();
    await expect(page.getByRole("article", { name, exact: true })).toContainText(name + " Editada");
    await page.getByRole("article", { name, exact: true }).getByRole("link", { name: "Editar" }).click();
    await page.getByRole("button", { name: "+ Nova categoria", exact: true }).click();
    await page.getByLabel("Nova categoria", { exact: true }).fill(second);
    await page.getByRole("button", { name: "Adicionar", exact: true }).click();
    await expect(page.getByLabel("Categoria", { exact: true }).locator("option:checked")).toHaveText(second);
    ids.push(Number(await page.getByLabel("Categoria", { exact: true }).inputValue()));
    await page.getByRole("button", { name: "Salvar produto", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Produtos", exact: true })).toBeVisible();
    await page.getByLabel("Categoria", { exact: true }).selectOption(String(ids[1]));
    await page.getByLabel("Público", { exact: true }).selectOption("unissex");
    await page.getByLabel("Publicação", { exact: true }).selectOption("published");
    await page.getByLabel("Estoque", { exact: true }).selectOption("variante-baixo");
    await page.getByRole("searchbox").fill(name);
    await expect(page.getByRole("article")).toHaveCount(1);
    await page.getByRole("link", { name: "Configurações", exact: true }).click();
    await page.getByRole("button", { name: `Excluir ${name} Editada`, exact: true }).click();
    await page.getByRole("button", { name: "Confirmar exclusão de categoria" }).click();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await page.getByRole("link", { name: "Produtos", exact: true }).click();
    await expect(page.getByLabel("Categoria", { exact: true }).locator(`option[value="${ids[0]}"]`)).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally {
    if (productId) await page.request.delete(`/api/produtos/${productId}`, { headers });
    for (const id of ids) await page.request.delete(`/api/categorias/${id}`, { headers });
  }
});

test("Header and Aside share dynamic availability and clear invalid IDs through exhaustion, restock and unpublication", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const product = (id: number, name: string, stock: number, isPublished = true) => ({
    id, name, price: 20, public: "unissex", categoryId: id,
    category: { id, name }, isPublished, colors: [{ id, colorName: "Preto", colorValue: "#111111", images: [], variants: [{ id, value: "P", stock }] }]
  });
  let catalog = [product(10, "Acessórios", 1), product(20, "Coleção especial", 0), product(30, "Oculta", 5, false)];
  await page.route("**/api/produtos", route => route.fulfill({ json: catalog }));
  await page.goto("/");
  const aside = page.locator("aside section").nth(2);
  const header = page.locator("header");
  const check = async (labels: string[]) => {
    await expect(aside.locator("button[aria-pressed]")).toHaveText(["Todos", ...labels]);
    await header.getByRole("button", { name: "Categorias", exact: true }).click();
    await expect(header.locator("button[aria-pressed]")).toHaveText(["Todos", ...labels]);
    await header.getByRole("button", { name: "Categorias", exact: true }).click();
  };
  const refresh = async () => { const response = page.waitForResponse(r => r.url().endsWith("/api/produtos")); await page.evaluate(() => window.dispatchEvent(new Event("focus"))); await response; };
  await check(["Acessórios"]);
  await aside.getByRole("button", { name: "Acessórios", exact: true }).click();
  catalog = [product(10, "Acessórios", 0), product(20, "Coleção especial", 1), product(30, "Oculta", 5, false)];
  await refresh(); await check(["Coleção especial"]);
  await expect(aside.getByRole("button", { name: "Todos", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("heading", { name: "Todas as Peças", exact: true })).toBeVisible();
  catalog = [product(10, "Acessórios renomeados", 2), product(20, "Coleção especial", 1)];
  await refresh(); await check(["Acessórios renomeados", "Coleção especial"]);
  await aside.getByRole("button", { name: "Acessórios renomeados", exact: true }).click();
  catalog = [product(10, "Nome atualizado", 2), product(20, "Coleção especial", 1)];
  await refresh();
  await expect(aside.getByRole("button", { name: "Nome atualizado", exact: true })).toHaveAttribute("aria-pressed", "true");
  catalog = [product(10, "Nome atualizado", 2, false), product(20, "Coleção especial", 1)];
  await refresh(); await check(["Coleção especial"]);
  await expect(aside.getByRole("button", { name: "Todos", exact: true })).toHaveAttribute("aria-pressed", "true");
});
