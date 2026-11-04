import { test, expect, type Page } from "@playwright/test";

const products = [101, 100].map(id => ({
  id, name: `Footer ${id}`, price: 30, public: "unissex", category: "camisetas", isPublished: true,
  colors: [{ id: id * 10, colorName: "Preto", colorValue: "#111111", images: ["/related-front.svg"], variants: [{ id: id * 10, value: "P", stock: 5 }] }]
}));

async function setup(page: Page) {
  await page.route("**/api/produtos", route => route.fulfill({ json: products }));
  await page.route("**/api/produtos/carrossel", route => route.fulfill({ json: [] }));
  await page.route("**/api/settings/public", route => route.fulfill({ json: { address: null, whatsapp: null } }));
  await page.route("**/related-front.svg", route => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500"><rect width="400" height="500" fill="#ddd"/></svg>' }));
}

for (const width of [320, 390, 768, 1440]) test(`store footer appears once after detail and on Home at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await setup(page);
  const footer = page.locator("footer#contato");

  await page.goto("/?productId=100");
  await expect(page.getByRole("heading", { name: "Footer 100", exact: true })).toBeVisible();
  await expect(footer).toHaveCount(1);
  await expect(footer).toContainText("Contato");
  if (width < 768) {
    const columns = footer.locator(".max-w-7xl > div.grid > div");
    for (const column of await columns.all()) await expect(column).toHaveCSS("align-items", "center");
  }
  const detailBottom = await page.locator(".store-product-card").first().evaluate(el => el.getBoundingClientRect().bottom + window.scrollY);
  const relatedBottom = await page.locator("#related-products-title").evaluate(el => el.parentElement!.getBoundingClientRect().bottom + window.scrollY);
  const footerTop = await footer.evaluate(el => el.getBoundingClientRect().top + window.scrollY);
  expect(footerTop).toBeGreaterThanOrEqual(detailBottom);
  expect(footerTop).toBeGreaterThanOrEqual(relatedBottom);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  await page.locator(".store-product-card").last().getByRole("img").click();
  await expect(page).toHaveURL(/productId=101/);
  await expect(footer).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "Footer 101", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Voltar para a loja" }).click();
  await expect(page).toHaveURL("/");
  await expect(footer).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "Footer 100", exact: true })).toHaveCount(0);
});

test("shared header filters work from product details and return to the filtered catalog", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await setup(page);
  await page.goto("/?productId=100");

  const header = page.locator("header");
  await expect(header).toHaveCount(1);
  await expect(header.getByRole("button", { name: "Público" })).toHaveCount(0);
  await expect(header.getByRole("button", { name: "Categorias" })).toBeVisible();

  await header.getByRole("button", { name: "Categorias" }).click();
  await header.getByRole("button", { name: "camisetas", exact: true }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { name: "camisetas", exact: true })).toBeVisible();
  await expect(page.locator(".store-product-card")).toHaveCount(2);

  await page.goto("/");
  await page.locator("aside section").nth(1).getByRole("button", { name: "Infantil", exact: true }).click();
  await expect(page).toHaveURL("/");
  await expect(page.locator(".store-product-card")).toHaveCount(0);
});

test("mobile category filter remains available from product details while audience is hidden", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page);
  await page.goto("/?productId=100");
  const header = page.locator("header");
  await expect(header).toHaveCount(1);
  await header.getByRole("button", { name: "Abrir menu de navegação" }).click();
  const mobileMenu = header.locator("div.md\\:hidden").filter({ has: page.getByText("Categorias", { exact: true }) });
  await expect(mobileMenu.getByText("Categorias", { exact: true })).toBeVisible();
  await expect(mobileMenu.getByText("Público", { exact: true })).toBeHidden();
  await mobileMenu.getByRole("button", { name: "camisetas", exact: true }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { name: "camisetas", exact: true })).toBeVisible();
  await expect(page.locator(".store-product-card")).toHaveCount(2);
});
