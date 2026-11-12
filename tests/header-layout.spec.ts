import { test, expect, type Page } from "@playwright/test";

// Os links do header (Início, Categorias, Contato) ficam centralizados na largura do header, não no espaço
// entre o logo e o grupo conta + carrinho; o nome do cliente não pode empurrá-los.
async function login(page: Page) {
  await page.getByRole("button", { name: "Entrar", exact: true }).first().click();
  await page.getByLabel("E-mail", { exact: true }).fill(process.env.E2E_USER_EMAIL!);
  await page.getByLabel("Senha", { exact: true }).fill(process.env.E2E_USER_PASSWORD!);
  await page.locator('form button[type="submit"]').click();
  await expect(page.getByRole("button", { name: "Cliente", exact: true })).toBeVisible();
}

// Troca só o nome devolvido pelo /auth/me (a sessão continua a do cliente de teste).
async function showName(page: Page, name: string) {
  await page.unroute("**/api/auth/me");
  await page.route("**/api/auth/me", async route => {
    const response = await route.fetch(), json = await response.json();
    json.account.name = name;
    await route.fulfill({ response, json });
  });
  await page.reload();
  await expect(page.locator("header").getByText(name.split(" ")[0], { exact: true })).toBeVisible();
}

async function measure(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  return page.evaluate(() => {
    const header = document.querySelector("header")!.getBoundingClientRect();
    const nav = document.querySelector("header nav")!.getBoundingClientRect();
    const logo = document.querySelector('header [aria-label="MCD Store — página inicial"]')!.getBoundingClientRect();
    const cart = document.querySelector('header [aria-label="Abrir carrinho"]')!.getBoundingClientRect();
    const content = document.querySelector("main")?.querySelector(".max-w-7xl")?.getBoundingClientRect() ?? null;
    const name = [...document.querySelectorAll<HTMLElement>("header span.truncate")][0];
    return { headerCenter: header.left + header.width / 2, navCenter: nav.left + nav.width / 2, navLeft: nav.left,
      logoLeft: logo.left, cartRight: cart.right, contentLeft: content?.left ?? null,
      nameTruncated: name ? name.scrollWidth > name.clientWidth : null,
      nameInside: name ? name.getBoundingClientRect().right <= name.closest("button")!.getBoundingClientRect().right : null, overflow: document.documentElement.scrollWidth > innerWidth };
  });
}

for (const size of [{ width: 1920, height: 1080 }, { width: 1280, height: 800 }]) test(`header links stay centered on the full header width at ${size.width}px`, async ({ page }, info) => {
  await page.setViewportSize(size);
  await page.goto("/");
  await expect(page.locator(".store-product-card").first()).toBeVisible();
  const guest = await measure(page);
  expect(Math.abs(guest.navCenter - guest.headerCenter)).toBeLessThanOrEqual(1);
  expect(guest.overflow).toBe(false);
  await page.locator("header").screenshot({ path: info.outputPath(`header-${size.width}-visitante.png`) });

  await login(page);
  const results = { guest } as Record<string, Awaited<ReturnType<typeof measure>>>;
  for (const [label, name] of [["curto", "Luan"], ["longo", "Maximilianobartolome Souza"], ["longo-demais", "Maximilianobartolomeudasilvasauro Souza"]] as const) {
    await showName(page, name);
    const now = await measure(page);
    results[label] = now;
    expect(Math.abs(now.navCenter - now.headerCenter), `menu centralizado com nome ${label}`).toBeLessThanOrEqual(1);
    expect(Math.abs(now.navLeft - guest.navLeft), `menu no mesmo lugar com nome ${label}`).toBeLessThanOrEqual(1);
    // Logo e carrinho continuam alinhados como antes (mesmo container).
    expect(now.logoLeft).toBeCloseTo(guest.logoLeft, 1);
    expect(now.cartRight).toBeCloseTo(guest.cartRight, 1);
    expect(now.overflow).toBe(false);
    await page.locator("header").screenshot({ path: info.outputPath(`header-${size.width}-${label}.png`) });
  }
  // O header mostra o primeiro nome em até 160px: 20 caracteres cabem; um nome maior trunca com reticências.
  expect(results.longo.nameTruncated).toBe(false);
  expect(results["longo-demais"].nameTruncated).toBe(true);
  for (const label of ["curto", "longo", "longo-demais"]) expect(results[label].nameInside, `nome ${label} dentro do botão`).toBe(true);
  expect(await page.locator("header span.truncate").first().evaluate(el => getComputedStyle(el).textOverflow)).toBe("ellipsis");
  console.log(`Header ${size.width}px: ${JSON.stringify(results)}`);
});

test("mobile header keeps logo left and actions right", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator(".store-product-card").first()).toBeVisible();
  await expect(page.locator("header nav")).toBeHidden();
  const layout = await page.evaluate(() => {
    const header = document.querySelector("header")!.getBoundingClientRect();
    const logo = document.querySelector('header [aria-label="MCD Store — página inicial"]')!.getBoundingClientRect();
    const menu = document.querySelector('header [aria-label="Abrir menu de navegação"]')!.getBoundingClientRect();
    return { logoLeft: logo.left - header.left, menuRight: header.right - menu.right, height: header.height };
  });
  expect(layout.logoLeft).toBeCloseTo(16, 0); // px-4
  expect(layout.menuRight).toBeCloseTo(16, 0);
  await page.locator("header").screenshot({ path: info.outputPath("header-390.png") });
  await page.getByRole("button", { name: "Abrir menu de navegação" }).click();
  await expect(page.getByRole("button", { name: "Entrar", exact: true }).first()).toBeVisible();
});
