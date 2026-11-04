import { test, expect, type Page } from "@playwright/test";

const emailFor = (suffix: string) => `${process.env.E2E_PROFILE_PREFIX}-${suffix}@example.test`;
async function login(page: Page, suffix: string) {
  await page.goto("/minha-conta");
  await page.locator("main").getByRole("button", { name: "Entrar", exact: true }).click();
  await page.getByLabel("E-mail", { exact: true }).fill(emailFor(suffix));
  await page.getByLabel("Senha", { exact: true }).fill(process.env.E2E_USER_PASSWORD!);
  await page.locator('form button[type="submit"]').click();
  await expect(page.getByLabel("Nome completo", { exact: true })).toHaveValue("Nome Completo Perfil");
}
async function profile(page: Page) {
  const token = await page.evaluate(() => JSON.parse(localStorage.getItem("mcd-store_auth_v1")!).accessToken);
  return (await page.request.get("/api/conta", { headers: { Authorization: `Bearer ${token}` } })).json();
}
const viaCep = { cep: "01001-000", logradouro: "Praça da Sé", bairro: "Sé", localidade: "São Paulo", uf: "SP", complemento: "NÃO USAR" };
const save = (page: Page) => page.getByRole("button", { name: "Salvar alterações", exact: true }).click();

test("real identity is read-only by name; email updates immediately, persists and rejects duplicates", async ({ page }) => {
  await login(page, "personal");
  await expect(page.getByLabel("Nome completo", { exact: true })).toHaveAttribute("readonly", "");
  await expect(page.getByLabel("E-mail", { exact: true })).toHaveValue(emailFor("personal"));
  await save(page);
  await expect(page.getByText("Alteração salva.", { exact: true })).toBeVisible();
  expect((await profile(page)).address).toBeNull();
  await page.getByLabel("E-mail", { exact: true }).fill(process.env.E2E_ADMIN_EMAIL!);
  await save(page);
  await expect(page.getByRole("alert")).toHaveText("E-mail já utilizado.");
  expect((await profile(page)).account.email).toBe(emailFor("personal"));
  await page.getByLabel("E-mail", { exact: true }).fill(emailFor("updated").toUpperCase());
  await save(page);
  await expect(page.getByText("Alteração salva.", { exact: true })).toBeVisible();
  await expect(page.getByLabel("E-mail", { exact: true })).toHaveValue(emailFor("updated"));
  await expect(page.getByRole("button", { name: "Nome", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("E-mail", { exact: true })).toHaveValue(emailFor("updated"));
});

test("CEP fills editable fields without touching number/complement; address persists, edits and clears on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let requests = 0;
  await page.route("https://viacep.com.br/**", async route => { requests++; await route.fulfill({ json: viaCep }); });
  await login(page, "address");
  const labels = page.locator('section[aria-labelledby="address-title"] label');
  await expect(labels).toHaveText(["CEP", "Rua / Logradouro", "Número", "Complemento", "Bairro", "Cidade", "Estado / UF"]);
  await page.getByLabel("Número", { exact: true }).fill("15");
  await page.getByLabel("Complemento", { exact: true }).fill("Apto 7");
  await page.getByLabel("CEP", { exact: true }).fill("01001");
  await page.getByLabel("CEP", { exact: true }).fill("01001000");
  await expect(page.getByLabel("CEP", { exact: true })).toHaveValue("01001-000");
  await expect(page.getByLabel("Rua / Logradouro")).toHaveValue("Praça da Sé");
  await expect(page.getByLabel("Bairro", { exact: true })).toHaveValue("Sé");
  await expect(page.getByLabel("Cidade", { exact: true })).toHaveValue("São Paulo");
  await expect(page.getByLabel("Estado / UF")).toHaveValue("SP");
  await expect(page.getByLabel("Número", { exact: true })).toHaveValue("15");
  await expect(page.getByLabel("Complemento", { exact: true })).toHaveValue("Apto 7");
  expect(requests).toBe(1);
  await page.getByLabel("Rua / Logradouro").fill("Rua corrigida");
  await save(page);
  await expect(page.getByText("Alteração salva.", { exact: true })).toBeVisible();
  expect((await profile(page)).address).toEqual({ cep: "01001000", street: "Rua corrigida", number: "15", complement: "Apto 7", neighborhood: "Sé", city: "São Paulo", state: "SP" });
  await page.reload();
  await expect(page.getByLabel("Rua / Logradouro")).toHaveValue("Rua corrigida");
  expect(requests).toBe(1); // Loading a saved address does not query or overwrite it.
  await page.getByLabel("Número", { exact: true }).fill("17");
  await page.getByLabel("Complemento", { exact: true }).fill("");
  await save(page);
  await expect(page.getByText("Alteração salva.", { exact: true })).toBeVisible();
  expect((await profile(page)).address.complement).toBe("");
  await page.getByRole("button", { name: "Limpar endereço" }).click();
  await save(page);
  await expect(page.getByText("Alteração salva.", { exact: true })).toBeVisible();
  expect((await profile(page)).address).toBeNull();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("CEP errors permit manual input; delayed responses cannot overwrite newer edits", async ({ page }) => {
  await page.route("https://viacep.com.br/**", route => route.fulfill({ json: { erro: true } }));
  await login(page, "lookup");
  await page.getByLabel("CEP", { exact: true }).fill("99999999");
  await expect(page.getByText(/CEP não encontrado/)).toBeVisible();
  await page.unroute("https://viacep.com.br/**");
  await page.route("https://viacep.com.br/**", route => route.abort());
  await page.getByLabel("CEP", { exact: true }).fill("01001000");
  await expect(page.getByText(/Consulta de CEP indisponível/)).toBeVisible();
  for (const [label, value] of [["Rua / Logradouro", "Rua manual"], ["Número", "s/n"], ["Bairro", "Centro"], ["Cidade", "São Paulo"], ["Estado / UF", "SP"]]) await page.getByLabel(label, { exact: true }).fill(value);
  await save(page);
  await expect(page.getByText("Alteração salva.", { exact: true })).toBeVisible();
  expect((await profile(page)).address.street).toBe("Rua manual");
  await page.unroute("https://viacep.com.br/**");
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("https://viacep.com.br/**", async route => { await gate; await route.fulfill({ json: viaCep }); });
  await page.getByLabel("CEP", { exact: true }).fill("01002000");
  await expect(page.getByText("Buscando CEP...", { exact: true })).toBeVisible();
  await page.getByLabel("Rua / Logradouro").fill("Correção durante consulta");
  release();
  await expect(page.getByText(/CEP encontrado\./)).toBeVisible();
  await expect(page.getByLabel("Rua / Logradouro")).toHaveValue("Correção durante consulta");
  await expect(page.getByLabel("Número", { exact: true })).toHaveValue("s/n");
});

test("password errors, confirmation and successful change preserve session and update login", async ({ page }) => {
  await login(page, "password");
  await page.getByRole("button", { name: "Alterar senha", exact: true }).click();
  await page.getByLabel("Senha atual", { exact: true }).fill("incorrect");
  const newPassword = "New-password-42";
  await page.getByLabel("Nova senha", { exact: true }).fill(newPassword);
  await page.getByLabel("Confirmar nova senha", { exact: true }).fill("different");
  await page.getByRole("button", { name: "Salvar nova senha" }).click();
  await expect(page.getByRole("alert")).toContainText("confirmação");
  await page.getByLabel("Confirmar nova senha", { exact: true }).fill(newPassword);
  await page.getByRole("button", { name: "Salvar nova senha" }).click();
  await expect(page.getByRole("alert")).toHaveText("Senha atual incorreta.");
  await page.getByLabel("Senha atual", { exact: true }).fill(process.env.E2E_USER_PASSWORD!);
  await page.getByRole("button", { name: "Salvar nova senha" }).click();
  await expect(page.getByText("Senha alterada com sucesso.", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Senha atual", { exact: true })).toHaveCount(0);
  expect((await profile(page)).account.email).toBe(emailFor("password"));
  for (const [password, status] of [[process.env.E2E_USER_PASSWORD!, 401], [newPassword, 200]] as const) {
    expect((await page.request.post("/api/auth/login", { data: { email: emailFor("password"), password } })).status()).toBe(status);
  }
});
