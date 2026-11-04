import { test, expect, type Page } from "@playwright/test";

const raw = { id: 9001, name: "Cooldown", price: 30, public: "unissex", category: "camisetas", colors: [
  { id: 901, colorName: "Preto", colorValue: "#111111", images: [], variants: [{ id: 9011, value: "M", stock: 5 }, { id: 9012, value: "G", stock: 5 }] },
  { id: 902, colorName: "Branco", colorValue: "#ffffff", images: [], variants: [{ id: 9021, value: "M", stock: 5 }] }
] };
const toasts = (page: Page) => page.locator('[data-sonner-toast][data-type="success"]');
async function harness(page: Page, user = false) {
  await page.route(/\/cooldown-harness(?:\?.*)?$/, route => route.fulfill({ contentType: "text/html", body: `<div id="root"></div>
    <script type="module">
      import RefreshRuntime from '/@react-refresh';
      RefreshRuntime.injectIntoGlobalHook(window);
      window.$RefreshReg$ = () => {};
      window.$RefreshSig$ = () => type => type;
      window.__vite_plugin_react_preamble_installed__ = true;
      await import('/tests/fixtures/cooldown-harness.tsx');
    </script>` }));
  await page.route("**/api/favoritos", route => route.fulfill({ json: [] }));
  await page.goto(`/cooldown-harness${user ? "?user" : ""}`);
  await expect(page.locator('[data-ready]')).toHaveText("true");
  await page.clock.pauseAt(new Date());
}
async function add(page: Page, size = "M", color = 901, product = 0) {
  return page.evaluate(({ size, color, product }) => {
    const w = window as any;
    return w.shopping.add(w.selection(color, product), size);
  }, { size, color, product });
}
async function items(page: Page) {
  return page.locator('[data-items]').textContent();
}

test("synchronous guest calls, cooldown, independent variants/products and cart plus", async ({ page }) => {
  await harness(page);
  expect(await page.evaluate(() => {
    const w = window as any;
    return Promise.all(Array.from({ length: 8 }, () => w.shopping.add(w.selection(), "M")));
  })).toEqual([true, false, false, false, false, false, false, false]);
  await page.clock.runFor(0);
  await expect(toasts(page)).toHaveCount(1);
  expect(await add(page)).toBe(false);
  await page.clock.runFor(999);
  expect(await add(page)).toBe(false);
  expect(await items(page)).toBe('[[9001,901,"M",1]]');
  await page.clock.runFor(1);
  expect(await add(page)).toBe(true);
  expect(await add(page, "G")).toBe(true);
  expect(await add(page, "M", 902)).toBe(true);
  expect(await add(page, "M", 901, 1)).toBe(true);
  expect(await add(page)).toBe(false);
  await page.clock.runFor(0);
  await expect(toasts(page)).toHaveCount(5);
  await page.evaluate(async () => {
    const w = window as any;
    await w.shopping.changeQty(9001, "M", 1, 901);
  });
  expect(await items(page)).toContain('[9001,901,"M",3]');
});

test("USER pending calls are guarded; different variants queue without losing updates", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let calls = 0;
  const saved: any[] = [];
  await page.route("**/api/carrinho", async route => {
    if (route.request().method() === "POST") {
      calls++;
      if (calls === 1) await gate;
      const { colorId, size } = route.request().postDataJSON();
      saved.push({ product: raw, colorId, size, quantity: 1 });
    }
    await route.fulfill({ json: { items: saved, notices: [] } });
  });
  await harness(page, true);
  await page.evaluate(() => {
    const w = window as any;
    w.results = Promise.all([w.shopping.add(w.selection(), "M"), w.shopping.add(w.selection(), "M"), w.shopping.add(w.selection(), "G")]);
  });
  await expect.poll(() => calls).toBe(1);
  await page.clock.runFor(2000);
  expect(await add(page)).toBe(false);
  await page.clock.runFor(0);
  await expect(toasts(page)).toHaveCount(0);
  release();
  expect(await page.evaluate(() => (window as any).results)).toEqual([true, false, true]);
  expect(calls).toBe(2);
  expect(await add(page)).toBe(false);
  await page.clock.runFor(0);
  await expect(toasts(page)).toHaveCount(2);
  expect(await items(page)).toBe('[[9001,901,"M",1],[9001,901,"G",1]]');
});

for (const failure of [503, 409, 200]) test(`USER failure/no change (${failure}) permits immediate retry without success cooldown`, async ({ page }) => {
  let calls = 0;
  await page.route("**/api/carrinho", route => {
    if (route.request().method() !== "POST") return route.fulfill({ json: { items: [], notices: [] } });
    calls++;
    if (calls === 1) return route.fulfill({ status: failure, json: failure === 200 ? { items: [], notices: [] } : { error: "Adição rejeitada" } });
    return route.fulfill({ json: { items: [{ product: raw, colorId: 901, size: "M", quantity: 1 }], notices: [] } });
  });
  await harness(page, true);
  expect(await add(page)).toBe(false);
  await page.clock.runFor(0);
  await expect(toasts(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "M: idle" })).toBeEnabled();
  expect(await add(page)).toBe(true);
  expect(calls).toBe(2);
  await page.clock.runFor(0);
  await expect(toasts(page)).toHaveCount(1);
});

test("guest stock rejection never starts success feedback", async ({ page }) => {
  await harness(page);
  await page.evaluate(() => {
    const w = window as any;
    w.outOfStock = { ...w.selection(), variants: [{ value: "M", stock: 0 }] };
  });
  expect(await page.evaluate(() => (window as any).shopping.add((window as any).outOfStock, "M"))).toBe(false);
  await page.clock.runFor(0);
  await expect(toasts(page)).toHaveCount(0);
  expect(await add(page)).toBe(true);
});

test("real card and details share feedback across size/color changes; keyboard cannot bypass it", async ({ page }) => {
  await page.route("**/api/produtos{,/admin}", route => route.fulfill({ json: [raw] }));
  await page.goto("/");
  await page.clock.pauseAt(new Date());
  const card = page.locator("main div.group").filter({ has: page.getByText("Cooldown", { exact: true }) });
  await card.getByRole("button", { name: "M", exact: true }).click();
  const button = card.locator("button").last();
  await button.focus();
  await page.keyboard.press("Enter");
  await expect(button).toHaveText("✓ Adicionado!");
  await expect(button).toBeDisabled();
  await page.keyboard.press("Enter"); await page.keyboard.press("Space");
  await page.clock.runFor(0);
  await expect(toasts(page)).toHaveCount(1);
  await card.getByRole("button", { name: "G", exact: true }).click();
  await expect(button).toBeEnabled();
  await card.getByRole("button", { name: "M", exact: true }).click();
  await expect(button).toBeDisabled();
  await card.getByRole("button", { name: "Branco", exact: true }).click();
  await expect(button).toBeEnabled();
  await card.getByRole("button", { name: "Preto", exact: true }).click();
  await expect(button).toBeDisabled();
  await page.evaluate(() => { history.pushState({}, "", "/?productId=9001"); window.dispatchEvent(new PopStateEvent("popstate")); });
  await page.getByRole("button", { name: "M", exact: true }).click();
  await expect(page.getByRole("button", { name: "✓ Adicionado!", exact: true })).toBeDisabled();
  await page.clock.runFor(1000);
  const detailButton = page.getByRole("button", { name: "Adicionar ao carrinho", exact: true });
  await expect(detailButton).toBeEnabled();
  await detailButton.focus(); await page.keyboard.press("Space");
  await page.clock.runFor(0);
  await expect(toasts(page)).toHaveCount(2);
});

test("rapid mobile taps add only one unit", async ({ browser }) => {
  const context = await browser.newContext({ hasTouch: true, viewport: { width: 390, height: 844 } });
  try {
    const page = await context.newPage();
    await page.route("**/api/produtos{,/admin}", route => route.fulfill({ json: [raw] }));
    await page.goto("http://127.0.0.1:4178/");
    await page.clock.pauseAt(new Date());
    await page.locator("main div.group").filter({ has: page.getByText("Cooldown", { exact: true }) }).getByRole("button", { name: "M", exact: true }).tap();
    const button = page.getByRole("button", { name: "Adicionar ao carrinho", exact: true });
    const bounds = await button.boundingBox();
    for (let i = 0; i < 5; i++) await page.touchscreen.tap(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2);
    await expect(page.getByRole("button", { name: "✓ Adicionado!", exact: true })).toBeDisabled();
    await page.clock.runFor(0);
  await expect(toasts(page)).toHaveCount(1);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("brecho_guest_cart_v2")!)[0].quantity)).toBe(1);
  } finally { await context.close(); }
});


test("favorite cooldown guards each product, concurrent snapshots and failures", async ({ page }) => {
  await page.route("**/api/carrinho", route => route.fulfill({ json: { items: [], notices: [] } }));
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const calls: string[] = [];
  let fail = false;
  await page.route("**/api/favoritos/*", async route => {
    const id = Number(route.request().url().split('/').pop());
    const method = route.request().method();
    calls.push(`${method}:${id}`);
    if (id === 9001 && calls.length === 1) await gate;
    if (fail) return route.fulfill({ status: 503, json: { error: 'Favorite failed' } });
    await route.fulfill({ json: method === 'PUT' ? [{ product: { ...raw, id } }] : [] });
  });
  await harness(page, true);
  await page.evaluate(() => {
    const w = window as any;
    w.favoriteResults = Promise.all([w.shopping.toggleFavorite(9001), w.shopping.toggleFavorite(9001), w.shopping.toggleFavorite(9002)]);
  });
  await expect.poll(() => calls.length).toBe(2);
  expect(calls).toEqual(['PUT:9001', 'PUT:9002']);
  release();
  expect(await page.evaluate(() => (window as any).favoriteResults)).toEqual([true, false, true]);
  await page.clock.runFor(0);
  expect(await page.evaluate(() => (window as any).shopping.favorites.map((p: any) => p.id).sort())).toEqual([9001, 9002]);
  expect(await page.evaluate(() => (window as any).shopping.toggleFavorite(9001))).toBe(false);
  await expect(toasts(page)).toHaveCount(2);
  await page.clock.runFor(999);
  expect(await page.evaluate(() => (window as any).shopping.toggleFavorite(9001))).toBe(false);
  await page.clock.runFor(1);
  expect(await page.evaluate(() => (window as any).shopping.toggleFavorite(9001))).toBe(true);
  await page.clock.runFor(0);
  expect(calls.at(-1)).toBe('DELETE:9001');
  expect(await page.evaluate(() => (window as any).shopping.toggleFavorite(9001))).toBe(false);
  await expect(toasts(page)).toHaveCount(3);
  await page.clock.runFor(1000);
  fail = true;
  expect(await page.evaluate(() => (window as any).shopping.toggleFavorite(9001))).toBe(false);
  expect(await page.evaluate(() => (window as any).shopping.favoriteBlocked(9001))).toBe(false);
  await expect(toasts(page)).toHaveCount(3);
  fail = false;
  expect(await page.evaluate(() => (window as any).shopping.toggleFavorite(9001))).toBe(true);
});
