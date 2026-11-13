import { test, expect, type Page } from "@playwright/test";

// Carrinho lateral: abre com camadas + painel + conteúdo em sequência (GSAP), fecha pelo caminho inverso
// e só sai da tela no fim. Verifica foco, ESC, clique fora, abrir/fechar rápido e movimento reduzido.
const catalog = Array.from({ length: 8 }, (_, index) => ({
  id: 7700 + index, name: `Carrinho ${index}`, price: 30 + index, public: "unissex", category: "camisetas", isPublished: true,
  colors: [{ id: 7700 + index, colorName: "Preto", colorValue: "#111111", images: ["/cart-photo.svg"], variants: [{ id: 7700 + index, value: "P", stock: 5 }] }],
}));

async function setup(page: Page, width: number, itemCount = 2) {
  await page.setViewportSize({ width, height: width > 500 ? 1080 : 844 });
  await page.route("**/api/produtos{,/carrossel}", route => route.fulfill({ json: catalog }));
  await page.route("**/api/settings/public", route => route.fulfill({ json: { address: null, whatsapp: null, lowStockThreshold: 1, showLowStockBadge: false, showLastUnitBadge: false } }));
  await page.route("**/cart-photo.svg", route => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500"><rect width="400" height="500" fill="#ccc"/></svg>' }));
  await page.goto("/");
  await expect(page.locator(".store-product-card")).toHaveCount(catalog.length);
  // Adiciona os itens pela interface (o caminho real do cliente).
  for (const product of catalog.slice(0, itemCount)) {
    const card = page.locator(".store-product-card").filter({ has: page.getByText(product.name, { exact: true }) });
    await card.getByRole("button", { name: "P", exact: true }).click();
    await card.locator(".store-add-to-cart").click();
    await expect(card.locator(".store-add-to-cart")).toBeEnabled();
  }
}

const drawer = (page: Page) => page.locator("div.fixed.inset-y-0.right-0.bg-card");
const heading = (page: Page) => page.getByRole("heading", { name: "Seu Carrinho" });
const headerButton = (page: Page) => page.getByRole("button", { name: "Abrir carrinho", exact: true });

// Espera o fim da animação de abertura: painel no lugar e conteúdo totalmente visível.
async function expectOpened(page: Page) {
  await expect(heading(page)).toBeVisible();
  await expect.poll(() => drawer(page).evaluate(el => {
    const panel = el.getBoundingClientRect().right <= innerWidth + 0.5 && el.getBoundingClientRect().left >= innerWidth - el.getBoundingClientRect().width - 0.5;
    const staggered = [...el.querySelectorAll<HTMLElement>("[data-cart-stagger]")];
    return panel && staggered.length > 0 && staggered.every(node => getComputedStyle(node).opacity === "1" && ["none", "matrix(1, 0, 0, 1, 0, 0)"].includes(getComputedStyle(node).transform));
  })).toBe(true);
  await expect(page.getByRole("button", { name: "Fechar carrinho" })).toBeFocused();
}
async function expectClosed(page: Page) {
  await expect(heading(page)).toHaveCount(0);
  await expect(page.locator("div.store-backdrop")).toBeHidden(); // fica montado, escondido
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
}

for (const width of [1920, 390]) test.describe(`cart drawer animation at ${width}px`, () => {
  test("opens with prelayers and staggered content, closes by X, ESC and outside click, returning focus", async ({ page }) => {
    await setup(page, width);
    await headerButton(page).click();
    // Logo no começo: o painel ainda está entrando e as duas camadas existem, nas cores do tema.
    const layers = page.locator('div[aria-hidden="true"].pointer-events-none.fixed.inset-y-0.right-0');
    await expect(layers).toHaveCount(2);
    const colors = await layers.evaluateAll(nodes => nodes.map(node => getComputedStyle(node).backgroundColor));
    const theme = await page.evaluate(() => { const probe = document.createElement("div"); document.body.append(probe);
      const read = (value: string) => { probe.style.background = value; return getComputedStyle(probe).backgroundColor; };
      const result = [read("var(--primary)"), read("var(--muted)")]; probe.remove(); return result; });
    expect(colors).toEqual(theme);
    await expectOpened(page);
    // As camadas terminam escondidas atrás do painel, com a mesma largura dele.
    const widths = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('div[aria-hidden="true"].pointer-events-none.fixed.inset-y-0.right-0, div.fixed.inset-y-0.right-0.bg-card')].map(el => Math.round(el.getBoundingClientRect().width)));
    expect(new Set(widths).size).toBe(1);
    await page.screenshot({ path: test.info().outputPath(`cart-open-${width}.png`) });

    await page.getByRole("button", { name: "Fechar carrinho" }).click();
    await expect(headerButton(page)).toBeFocused();
    await expectClosed(page);

    await headerButton(page).click(); await expectOpened(page);
    await page.keyboard.press("Escape");
    await expect(headerButton(page)).toBeFocused();
    await expectClosed(page);

    // Clique fora: no celular o painel ocupa a largura toda (não há "fora"), então só no desktop.
    if (width > 500) {
      await headerButton(page).click(); await expectOpened(page);
      await page.mouse.click(5, 300);
      await expectClosed(page);
      await expect(headerButton(page)).toBeFocused();
    }
  });

  test("opens from the toast action the same way and closing returns focus to the header", async ({ page }) => {
    await setup(page, width, 0);
    const card = page.locator(".store-product-card").first();
    await card.getByRole("button", { name: "P", exact: true }).click();
    await card.locator(".store-add-to-cart").click();
    await page.getByRole("button", { name: "Ver no Carrinho" }).click();
    await expectOpened(page);
    await expect(drawer(page).locator("[data-cart-stagger]")).toHaveCount(3); // cabeçalho, item e rodapé
    await page.keyboard.press("Escape");
    await expectClosed(page);
    await expect(headerButton(page)).toBeFocused();
  });

  test("rapid open/close keeps a consistent state", async ({ page }) => {
    await setup(page, width);
    for (let round = 0; round < 5; round++) {
      await headerButton(page).click();
      await page.waitForTimeout(80);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(60);
    }
    await expectClosed(page);
    await headerButton(page).click(); await expectOpened(page);
    // Sem camadas ou fundos duplicados.
    await expect(page.locator("div.store-backdrop")).toHaveCount(1);
    await expect(drawer(page)).toHaveCount(1);
    // Fecha no meio da abertura e reabre no meio do fechamento: termina aberto e inteiro.
    await page.keyboard.press("Escape"); await page.waitForTimeout(50);
    await headerButton(page).click({ force: true });
    await expectOpened(page);
  });

  test("changing quantity or removing an item does not replay the stagger; only the first six items stagger", async ({ page }) => {
    await setup(page, width, 8);
    await headerButton(page).click(); await expectOpened(page);
    const items = drawer(page).locator(".bg-muted\\/50");
    await expect(items).toHaveCount(8);
    // Cabeçalho + 6 itens + rodapé; os itens 7 e 8 já aparecem prontos.
    await expect(drawer(page).locator("[data-cart-stagger]")).toHaveCount(8);
    const watch = () => drawer(page).evaluate(el => {
      const w = window as unknown as { __opacityDips: number };
      w.__opacityDips = 0;
      const nodes = [...el.querySelectorAll<HTMLElement>("[data-cart-stagger]")];
      const check = () => { if (nodes.some(node => node.isConnected && getComputedStyle(node).opacity !== "1")) w.__opacityDips++; if (document.contains(el)) requestAnimationFrame(check); };
      requestAnimationFrame(check);
    });
    await watch();
    await items.first().getByRole("button", { name: "Aumentar quantidade" }).click();
    await expect(items.first().locator("span.w-6")).toHaveText("2");
    await items.nth(1).getByRole("button", { name: "Remover item" }).click();
    await expect(items).toHaveCount(7);
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => (window as unknown as { __opacityDips: number }).__opacityDips)).toBe(0);
  });

  test("reduced motion opens and closes with at most a quick fade", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await setup(page, width);
    const started = Date.now();
    await headerButton(page).click();
    await expectOpened(page);
    // Sem deslocamento: o painel e o conteúdo nunca saem do lugar.
    expect(await drawer(page).evaluate(el => getComputedStyle(el).transform)).toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);
    await expect(page.locator('div[aria-hidden="true"].pointer-events-none.fixed.inset-y-0.right-0').first()).toBeHidden();
    await page.keyboard.press("Escape");
    await expectClosed(page);
    expect(Date.now() - started).toBeLessThan(3000);
  });
});

// Ao abrir a gaveta, os toasts do carrinho perdem a função e ficavam por cima dela, cobrindo os controles:
// são fechados (pelo header ou pelo "Ver no Carrinho"). Toasts de outros assuntos continuam na tela.
test("opening the drawer closes cart toasts and keeps toasts about other subjects", async ({ page }) => {
  await setup(page, 1920, 0);
  const toasts = page.locator("[data-sonner-toast]");
  const added = (name: string) => toasts.filter({ hasText: `${name} — tamanho P foi adicionado ao carrinho.` });
  const other = toasts.filter({ hasText: "Outro assunto" });
  const add = async (index: number) => {
    const card = page.locator(".store-product-card").filter({ has: page.getByText(`Carrinho ${index}`, { exact: true }) });
    await card.getByRole("button", { name: "P", exact: true }).click();
    await card.locator(".store-add-to-cart").click();
    await expect(added(`Carrinho ${index}`)).toHaveCount(1);
  };
  const otherToast = () => page.evaluate(async () => { const { notify } = await import("/src/app/lib/notifications.ts"); notify.error("Outro assunto"); });

  await add(0);
  await otherToast(); await expect(other).toHaveCount(1);
  await headerButton(page).click();
  await expect(added("Carrinho 0")).toHaveCount(0);
  await expect(other).toHaveCount(1);
  await expectOpened(page);
  await page.keyboard.press("Escape"); await expectClosed(page);
  await expect(other).toHaveCount(0); // expira normalmente

  await add(1);
  await otherToast(); await expect(other).toHaveCount(1);
  await added("Carrinho 1").getByRole("button", { name: "Ver no Carrinho" }).click();
  await expect(added("Carrinho 1")).toHaveCount(0);
  await expect(other).toHaveCount(1);
  await expectOpened(page);
});
