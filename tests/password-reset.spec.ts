import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";

// O servidor de E2E (backend/tests/helpers/frontend-server.ts) captura os e-mails em memória, sem enviar.
const outbox = "http://127.0.0.1:3187/__test/emails";
async function resetLink(page: Page, email: string) {
  let link = "";
  await expect.poll(async () => {
    const mails = await (await page.request.get(`${outbox}?to=${encodeURIComponent(email)}`)).json() as { subject: string; text: string }[];
    link = /https?:\/\/\S+\/redefinir-senha\?token=[A-Za-z0-9_-]{43}/.exec(mails.at(-1)?.text ?? "")?.[0] ?? "";
    return link;
  }).not.toBe("");
  return link;
}
async function openLogin(page: Page) {
  await page.getByRole("button", { name: "Entrar", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Entrar", exact: true })).toBeVisible();
}
async function login(page: Page, email: string, password: string) {
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.locator('form button[type="submit"]').click();
}

test("password reset: request link, open it, set a new password, sign in and the used link stops working", async ({ page, browser }) => {
  const email = `reset-${randomUUID()}@example.test`;
  const original = "Original1-" + randomUUID().slice(0, 6), next = "Nova2-" + randomUUID().slice(0, 6);
  const registered = await page.request.post("/api/auth/register", { data: { name: "Cliente Recuperação", email, password: original, confirmPassword: original } });
  expect(registered.status()).toBe(201);

  // Outra sessão aberta com a senha antiga: deve ser encerrada pela redefinição.
  const otherContext = await browser.newContext();
  const other = await otherContext.newPage();
  try {
    await other.goto("/"); await openLogin(other); await login(other, email, original);
    await expect(other.getByRole("button", { name: "Cliente", exact: true })).toBeVisible();

    // 1. Login → "Esqueci minha senha" → informar o e-mail.
    await page.goto("/");
    await openLogin(page);
    await page.getByRole("button", { name: "Esqueci minha senha", exact: true }).click();
    await expect(page).toHaveURL(/\/esqueci-senha$/);
    await expect(page.getByRole("heading", { name: "Esqueci minha senha", exact: true })).toBeVisible();
    await page.getByLabel("E-mail", { exact: true }).fill(email);
    await page.getByRole("button", { name: "Enviar link", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Se o e-mail estiver cadastrado, você receberá um link em instantes.");

    // 2. Abrir o link do e-mail: o token sai da barra de endereço.
    const link = await resetLink(page, email);
    expect(link.startsWith("http://127.0.0.1:4178/redefinir-senha?token=")).toBe(true);
    await page.goto(link);
    await expect(page).toHaveURL(/\/redefinir-senha$/);
    await expect(page.getByRole("heading", { name: "Criar nova senha", exact: true })).toBeVisible();

    // 3. Nova senha com os mesmos requisitos do cadastro; botão só habilita com tudo cumprido.
    const submit = page.getByRole("button", { name: "Redefinir senha", exact: true });
    await expect(submit).toBeDisabled();
    await page.getByLabel("Nova senha", { exact: true }).fill("fraca");
    // Mesmo componente de requisitos do cadastro: "fraca" ainda não cumpre nenhuma regra além do tamanho mínimo.
    const rules = page.getByRole("list", { name: "Requisitos da senha" });
    await expect(rules.getByRole("listitem")).toHaveText(["Mínimo de 6 caracteres: não cumprido", "Pelo menos 1 letra maiúscula: não cumprido", "Pelo menos 1 número: não cumprido"]);
    await page.getByLabel("Confirmar nova senha", { exact: true }).fill("fraca");
    await expect(submit).toBeDisabled();
    await page.getByLabel("Nova senha", { exact: true }).fill(next);
    await page.getByLabel("Confirmar nova senha", { exact: true }).fill(next + "x");
    await expect(page.getByText("As senhas não coincidem", { exact: true })).toBeVisible();
    await expect(submit).toBeDisabled();
    // A senha atual não pode ser reaproveitada.
    await page.getByLabel("Nova senha", { exact: true }).fill(original);
    await page.getByLabel("Confirmar nova senha", { exact: true }).fill(original);
    await submit.click();
    await expect(page.getByRole("alert")).toHaveText("A nova senha precisa ser diferente da senha atual.");
    await page.getByLabel("Nova senha", { exact: true }).fill(next);
    await page.getByLabel("Confirmar nova senha", { exact: true }).fill(next);
    await submit.click();
    await expect(page.getByRole("status")).toHaveText("Senha redefinida com sucesso. Entre com a nova senha.");

    // A sessão aberta com a senha antiga foi encerrada.
    await other.reload();
    await expect(other.getByRole("button", { name: "Entrar", exact: true }).first()).toBeVisible();
    await expect(other.getByRole("button", { name: "Cliente", exact: true })).toHaveCount(0);

    // 4. Entrar com a senha nova (a antiga não funciona mais).
    await page.getByRole("button", { name: "Entrar", exact: true }).last().click();
    await login(page, email, original);
    await expect(page.getByRole("alert")).toHaveText("E-mail ou senha inválidos.");
    await login(page, email, next);
    await expect(page.getByRole("button", { name: "Cliente", exact: true })).toBeVisible();
    await expect(page).toHaveURL(/127\.0\.0\.1:4178\/$/);

    // 5. O link já usado não funciona mais e oferece pedir um novo.
    await page.goto(link);
    await page.getByLabel("Nova senha", { exact: true }).fill("Outra3-" + randomUUID().slice(0, 6));
    await page.getByLabel("Confirmar nova senha", { exact: true }).fill(await page.getByLabel("Nova senha", { exact: true }).inputValue());
    await page.getByRole("button", { name: "Redefinir senha", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Link inválido ou expirado", exact: true })).toBeVisible();
    await expect(page.getByRole("alert")).toHaveText("Este link de redefinição é inválido ou expirou. Peça um novo link.");
    await page.getByRole("link", { name: "Pedir um novo link", exact: true }).click();
    await expect(page).toHaveURL(/\/esqueci-senha$/);
  } finally {
    await otherContext.close();
  }
});

test("reset page without a token shows the invalid-link message with a shortcut to request a new one", async ({ page }) => {
  await page.goto("/redefinir-senha");
  await expect(page.getByRole("alert")).toHaveText("Este link de redefinição é inválido ou expirou. Peça um novo link.");
  await expect(page.getByRole("link", { name: "Pedir um novo link", exact: true })).toHaveAttribute("href", "/esqueci-senha");
});
