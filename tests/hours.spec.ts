import { test, expect, type Page } from "@playwright/test";
import { initialBusinessHours, WEEK_DAYS, dayLabels } from "../backend/src/lib/business-hours";
let token: string, original: any;
test.beforeAll(async ({ request }) => {
  expect(new URL(process.env.DATABASE_URL!).pathname).toMatch(/^\/mcd_store_test_/);
  const session = await (await request.post("/api/auth/login", { data: { email: process.env.E2E_ADMIN_EMAIL, password: process.env.E2E_ADMIN_PASSWORD } })).json();
  token = session.accessToken;
  original = await (await request.get("/api/settings/store", { headers: { Authorization: `Bearer ${token}` } })).json();
});
test.afterAll(async ({ request }) => { if (original) await request.put("/api/settings/store", { headers: { Authorization: `Bearer ${token}` }, data: original }); });
async function settings(page: Page) {
  expect((await page.request.put("/api/settings/store", { headers: { Authorization: `Bearer ${token}` }, data: { businessHours: initialBusinessHours } })).ok()).toBe(true);
  await page.addInitScript(token => localStorage.setItem("mcd-store_auth_v1", JSON.stringify({ accessToken: token, expiresAt: Date.now() + 3600000 })), token);
  await page.goto("/manager/settings");
  await expect(page.getByRole("group", { name: "Horário de funcionamento" })).toBeVisible();
}
for (const width of [1440, 768, 390, 320]) test(`weekly hours save, persist and reach the footer at ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 900 }); await settings(page);
  for (const day of WEEK_DAYS) {
    await expect(page.getByRole("checkbox", { name: `${dayLabels[day]} aberto`, exact: true })).toBeVisible();
    await expect(page.getByLabel(`Abertura ${dayLabels[day]}`, { exact: true })).toHaveAttribute("type", "time");
  }
  const monday = page.getByRole("checkbox", { name: "Segunda-feira aberto", exact: true });
  const openMonday = page.getByLabel("Abertura Segunda-feira", { exact: true });
  await openMonday.fill("07:30"); await page.getByLabel("Fechamento Segunda-feira", { exact: true }).fill("17:45");
  await monday.uncheck(); await expect(openMonday).toBeDisabled(); await expect(openMonday).toHaveValue("07:30");
  await monday.check(); await expect(openMonday).toBeEnabled(); await expect(openMonday).toHaveValue("07:30");
  await page.getByRole("checkbox", { name: "Terça-feira aberto", exact: true }).uncheck();
  await expect(page.getByLabel("Abertura Terça-feira", { exact: true })).toBeDisabled();
  await page.getByLabel("Abertura Quarta-feira", { exact: true }).fill("07:30"); await page.getByLabel("Fechamento Quarta-feira", { exact: true }).fill("17:45");
  await expect(page.getByLabel("Abertura Domingo", { exact: true })).toBeDisabled();
  let body: any;
  await page.route("**/api/settings/store", async route => { if (route.request().method() === "PUT") body = route.request().postDataJSON(); await route.continue(); });
  await page.getByRole("button", { name: "Salvar dados da loja", exact: true }).click();
  await expect(page.locator('[data-sonner-toast][data-type="success"]')).toContainText("Dados da loja salvos com sucesso!");
  expect(body.businessHours.TUESDAY).toEqual({ isOpen: false, openingTime: null, closingTime: null });
  expect(body.businessHours.MONDAY.openingTime).toBe("07:30"); expect(Object.keys(body.businessHours)).toHaveLength(7);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("group", { name: "Horário de funcionamento" }).screenshot({ path: info.outputPath(`hours-manager-${width}.png`) });
  await page.reload(); await expect(openMonday).toHaveValue("07:30"); await expect(page.getByRole("checkbox", { name: "Terça-feira aberto", exact: true })).not.toBeChecked();
  const persisted = await (await page.request.get("/api/settings/store", { headers: { Authorization: `Bearer ${token}` } })).json();
  expect(persisted.businessHours).toEqual(body.businessHours);
  expect(persisted.address).toEqual(original.address); expect(persisted.whatsapp).toBe(original.whatsapp);
  await page.getByRole("link", { name: "Ver loja", exact: true }).click();
  const footer = page.locator("footer");
  await expect(footer).toContainText("Segunda: 07:30 às 17:45"); await expect(footer).toContainText("Terça: Fechado");
  await expect(footer).toContainText("Quarta: 07:30 às 17:45"); await expect(footer).toContainText("Quinta e sexta: 09:00 às 18:00");
  await expect(footer).toContainText("Sábado: 10:00 às 15:00"); await expect(footer).toContainText("Domingo: Fechado");
  await expect(footer).not.toContainText("Segunda a sexta:");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await footer.screenshot({ path: info.outputPath(`hours-footer-${width}.png`) });
});
test("backend error preserves hours draft and missing public data does not invent hours", async ({ page }) => {
  await settings(page); await page.getByLabel("Abertura Segunda-feira", { exact: true }).fill("08:30");
  await page.route("**/api/settings/store", route => route.request().method() === "PUT" ? route.fulfill({ status: 400, json: { error: "Segunda-feira: horário inválido no backend." } }) : route.continue());
  await page.getByRole("button", { name: "Salvar dados da loja", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("horário inválido no backend");
  await expect(page.getByLabel("Abertura Segunda-feira", { exact: true })).toHaveValue("08:30");
  await expect(page.locator('[data-sonner-toast][data-type="error"]')).toContainText("horário inválido no backend");
  await page.route("**/api/settings/public", route => route.fulfill({ status: 500, json: { error: "Unavailable" } }));
  await page.getByRole("link", { name: "Ver loja", exact: true }).click(); await page.reload();
  await expect(page.locator("footer")).toContainText("Horários não configurados nesta demonstração."); // rodapé de 04/11; sem inventar horários
  await expect(page.locator("footer")).not.toContainText("09:00 às 18:00");
});
