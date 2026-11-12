import { test, expect, type Page } from "@playwright/test";

// Abrir o carrinho ou o login trava a rolagem; a página por trás não pode se mover nem 1px.
// O Chromium sem janela esconde a barra de rolagem; aqui ela volta a aparecer, como no navegador real.
test.use({ launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] } });

const catalog = Array.from({ length: 12 }, (_, index) => ({
  id: 7500 + index, name: `Rolagem ${index}`, price: 40 + index, public: "unissex", category: index % 2 ? "camisetas" : "calcas", isPublished: true,
  colors: [{ id: 7500 + index, colorName: "Preto", colorValue: "#111111", images: ["/lock-photo.svg"], variants: [{ id: 7500 + index, value: "P", stock: 5 }] }],
}));

async function positions(page: Page) {
  return page.evaluate(() => {
    const box = (el: Element | null) => { if (!el) return null; const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, width: r.width }; };
    const title = [...document.querySelectorAll("h1, h2")].find(el => el.textContent?.trim() === "Todas as Peças") ?? null;
    return {
      header: box(document.querySelector("header")), title: box(title), marquee: box(document.querySelector(".store-service-strip")),
      whatsapp: box(document.querySelector('[aria-label="Falar conosco pelo WhatsApp"]')),
    };
  });
}

function expectSame(after: Awaited<ReturnType<typeof positions>>, before: Awaited<ReturnType<typeof positions>>, keys: (keyof typeof before)[]) {
  for (const key of keys) {
    expect(before[key], `${key} existe`).not.toBeNull();
    expect(after[key], `${key} não se move`).toEqual(before[key]);
  }
}

for (const width of [1920, 390]) test(`page behind the cart and the login modal does not shift at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: width > 500 ? 1080 : 844 });
  await page.route("**/api/produtos{,/carrossel}", route => route.fulfill({ json: catalog }));
  await page.route("**/api/settings/public", route => route.fulfill({ json: { address: null, whatsapp: "5541999999999", lowStockThreshold: 1, showLowStockBadge: false, showLastUnitBadge: false } }));
  await page.route("**/lock-photo.svg", route => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500"><rect width="400" height="500" fill="#ccc"/></svg>' }));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator(".store-product-card")).toHaveCount(catalog.length);
  const scrollbar = await page.evaluate(() => innerWidth - document.documentElement.clientWidth);
  if (width > 500) expect(scrollbar, "a barra de rolagem ocupa espaço no desktop").toBeGreaterThan(0);
  // Espera as fontes do Google carregarem e o layout parar (senão o título muda de largura sozinho).
  await page.evaluate(() => document.fonts.ready);
  let before = await positions(page);
  await expect.poll(async () => { const now = await positions(page); const same = JSON.stringify(now) === JSON.stringify(before); before = now; return same; }).toBe(true);

  await page.getByRole("button", { name: "Abrir carrinho", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Seu Carrinho" })).toBeVisible();
  expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).toBe("hidden");
  expectSame(await positions(page), before, ["header", "title", "marquee"]); // o botão do WhatsApp some com o carrinho aberto
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "Seu Carrinho" })).toHaveCount(0);
  expectSame(await positions(page), before, ["header", "title", "marquee", "whatsapp"]);
  expect(await page.evaluate(() => [document.body.style.overflow, document.body.style.paddingRight])).toEqual(["", ""]);

  // No celular o "Entrar" fica dentro do menu (que não trava a rolagem).
  if (width < 768) await page.getByRole("button", { name: "Abrir menu de navegação" }).click();
  await page.getByRole("button", { name: "Entrar", exact: true }).first().click();
  await expect(page.getByLabel("Senha", { exact: true })).toBeVisible();
  expectSame(await positions(page), before, ["header", "title", "marquee", "whatsapp"]);
  await page.keyboard.press("Escape");
  await expect(page.getByLabel("Senha", { exact: true })).toHaveCount(0);
  expectSame(await positions(page), before, ["header", "title", "marquee", "whatsapp"]);
  expect(await page.evaluate(() => [document.body.style.overflow, document.body.style.paddingRight, document.documentElement.hasAttribute("data-scroll-locked")])).toEqual(["", "", false]);
});
