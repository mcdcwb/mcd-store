import { test, expect, type Page } from "@playwright/test";

// Botão "voltar ao topo" (só celular): aparece só depois do carrossel E rolando para cima; leva ao topo.
const catalog = Array.from({ length: 12 }, (_, index) => ({
  id: 9100 + index, name: `Topo ${index}`, price: 40, public: "unissex", category: "camisetas", badge: null, inCarousel: index < 3,
  colors: [{ id: 9100 + index, colorName: "Preto", colorValue: "#111111", images: ["/topo.svg"], variants: [{ id: 9100 + index, value: "P", stock: 5 }] }],
}));
async function setup(page: Page, width: number) {
  await page.setViewportSize({ width, height: 800 });
  await page.route("**/topo.svg", route => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500"><rect width="100%" height="100%" fill="#ccc"/></svg>' }));
  await page.route("**/api/produtos{,/carrossel}", route => route.fulfill({ json: catalog }));
  await page.goto("/");
  await expect(page.locator(".store-product-card")).toHaveCount(catalog.length);
}
const button = (page: Page) => page.locator("[data-back-to-top]");
const scrollTo = async (page: Page, y: number) => { await page.evaluate(top => window.scrollTo({ top, behavior: "instant" }), y); await page.waitForTimeout(150); };

test("back-to-top appears only after the carousel when scrolling up, and returns to the top (390px)", async ({ page }) => {
  await setup(page, 390);
  const hidden = async () => { await expect(button(page)).toHaveCSS("opacity", "0"); await expect(button(page)).toHaveAttribute("tabindex", "-1"); };
  await hidden(); // no topo
  const carouselBottom = await page.locator('section[aria-label="Carrossel de produtos"]').evaluate(el => el.getBoundingClientRect().bottom + window.scrollY);
  for (let y = 200; y <= carouselBottom + 1200; y += 200) await scrollTo(page, y); // só para baixo
  await hidden();
  const bottom = carouselBottom + 1200;
  await scrollTo(page, bottom - 20); // pouco para cima: ainda não
  await hidden();
  await scrollTo(page, bottom - 120); // mais de 40px seguidos para cima
  await expect(button(page)).toHaveCSS("opacity", "1");
  await expect(button(page)).toHaveAttribute("aria-label", "Voltar ao topo");
  await expect(button(page)).toHaveAttribute("tabindex", "0");
  const box = (await button(page).boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44);
  await scrollTo(page, bottom); // voltou a descer
  await hidden();
  await scrollTo(page, bottom - 120);
  await button(page).click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await expect(page.getByRole("button", { name: "MCD Store — página inicial" })).toBeFocused();
  await hidden();
});

test("back-to-top does not exist on desktop", async ({ page }) => {
  await setup(page, 1280);
  await scrollTo(page, 2500); await scrollTo(page, 2300);
  await expect(button(page)).toHaveCount(0);
});
