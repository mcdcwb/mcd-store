// Vídeo 02-compra — do filtro ao checkout: cadastro, login, endereço por CEP e checkout de demonstração.
// Rodar: npm run record:02   (front em http://localhost:5173 e backend local no ar)
//
// ANTES de cada gravação, apague o usuário do roteiro (o cadastro faz parte do vídeo):
//   U=$(docker exec postgres-mcd-store printenv POSTGRES_USER)
//   docker exec -i postgres-mcd-store psql -U $U -d mcd_store_demo -v ON_ERROR_STOP=1 < recordings/02-compra.prepare.sql
// O script não acessa o banco; ele só confere pela API se o usuário ainda existe e, nesse caso, para.
// O CEP é preenchido pelo ViaCEP (serviço externo): ele precisa responder durante a gravação.
import type { Locator } from "@playwright/test";
import { BASE_URL, VIEWPORT, startRecording, moveAndClick, clickAt, hover, typeHuman, smoothScrollTo, pause } from "./helpers.ts";

const CUSTOMER = { name: "João da Silva", email: "joaodasilva@demonstrativo.com", password: "Joao123" };
const PRODUCT = "Bermuda Linho Verão";
const TIMING = {
  betweenFiltersMs: 800,  // entre um filtro e o próximo
  toastHoverMs: 1000,     // mouse parado sobre o toast (ele não some com o mouse em cima)
  requirementsMs: 1000,   // mostrando os requisitos de senha cumpridos
  checkoutVisibleMs: 1000, // Checkout na tela logo depois do login
  beforeAddressMs: 1000,  // a mais, com "Sim, preciso de entrega" marcado, antes de "Cadastrar endereço"
  whatsappHoverMs: 1500,  // aviso "Checkout desativado no modo de demonstração" na tela
  endMs: 1000,
};

// Conta já existente = a preparação não foi feita; gravar daria erro de e-mail já cadastrado.
const existing = await fetch(`${BASE_URL}/api/auth/login`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: CUSTOMER.email, password: CUSTOMER.password }),
}).catch(() => null);
if (existing?.status === 200)
  throw new Error(`O usuário ${CUSTOMER.email} já existe. Rode recordings/02-compra.prepare.sql (comando no topo deste arquivo) e grave de novo.`);

const rec = await startRecording("02-compra");
const { page } = rec;
const waitVisible = (locator: Locator, timeout = 15000) => locator.waitFor({ state: "visible", timeout });
try {
  await rec.open("/");
  const header = page.locator("header").first();
  const cart = page.locator("div.shadow-2xl").filter({ has: page.getByRole("heading", { name: "Seu Carrinho" }) });
  const authModal = page.locator("div.shadow-2xl").filter({ has: page.getByRole("button", { name: "Fechar login ou cadastro" }) });

  // 1. (open() já mostrou a home parada no topo por 2 s) Rola suavemente até os filtros ("Todas as Peças" logo abaixo do cabeçalho fixo).
  await page.locator(".store-catalog-grid").waitFor();
  const headerBottom = await header.evaluate(el => el.getBoundingClientRect().bottom);
  await smoothScrollTo(page.getByRole("heading", { name: "Todas as Peças" }), { top: headerBottom + 32 });
  await pause();

  // 2. Filtros, um por vez: tamanho G, Masculino, Bermudas (no filtro lateral).
  const filters = page.locator("aside");
  for (const [index, name] of ["G", "Masculino", "Bermudas"].entries()) {
    if (index) await pause(TIMING.betweenFiltersMs);
    await moveAndClick(filters.getByRole("button", { name, exact: true }));
  }
  await pause();

  // 3. Bermuda Linho Verão: escolhe G no card (o filtro não pré-seleciona o tamanho) e adiciona.
  const card = page.locator(".store-product-card").filter({ hasText: PRODUCT });
  await moveAndClick(card.getByRole("button", { name: "G", exact: true }));
  await pause();
  await moveAndClick(card.getByRole("button", { name: "Adicionar ao carrinho" }));

  // 4. Mouse sobre o toast por 1 s e "Ver no Carrinho".
  const toast = page.locator("[data-sonner-toast]").filter({ hasText: PRODUCT });
  await hover(toast, TIMING.toastHoverMs);
  await moveAndClick(toast.getByRole("button", { name: "Ver no Carrinho" }));

  // 5. No carrinho: "+" (quantidade 2) e "Finalizar compra".
  await waitVisible(cart);
  await pause();
  await moveAndClick(cart.getByRole("button", { name: "Aumentar quantidade" }));
  await cart.getByText("R$ 299,80").first().waitFor(); // 2 × R$ 149,90 confirmado pelo carrinho
  await pause();
  await moveAndClick(cart.getByRole("button", { name: "Finalizar compra" }));

  // 6. Modal de login → "Cadastre-se".
  await waitVisible(authModal);
  await pause();
  await moveAndClick(authModal.getByRole("button", { name: "Cadastre-se", exact: true }));

  // 7. Cadastro, com uma pausa mostrando os requisitos cumpridos.
  await waitVisible(authModal.getByRole("heading", { name: "Criar conta" }));
  await typeHuman(authModal.getByLabel("Nome completo"), CUSTOMER.name);
  await typeHuman(authModal.getByLabel("E-mail", { exact: true }), CUSTOMER.email);
  await typeHuman(authModal.getByLabel("Senha", { exact: true }), CUSTOMER.password);
  await typeHuman(authModal.getByLabel("Confirmar senha", { exact: true }), CUSTOMER.password);
  await pause(TIMING.requirementsMs);
  await moveAndClick(authModal.getByRole("button", { name: "Criar conta", exact: true }));
  await waitVisible(authModal.getByText("Conta criada com sucesso", { exact: false }));
  await pause();

  // 8. Login (o e-mail continua preenchido): senha e "Entrar". Como a compra começou antes, o site já
  //    leva ao Checkout; o roteiro espera ele carregar e mostra a tela por ~1 s (sem reabrir o carrinho).
  await typeHuman(authModal.getByLabel("Senha", { exact: true }), CUSTOMER.password);
  await pause();
  await moveAndClick(authModal.locator('form button[type="submit"]'));
  await page.waitForURL(/\/checkout$/, { timeout: 15000 });
  await waitVisible(page.getByRole("heading", { name: "Checkout", exact: true }));
  await waitVisible(page.getByText("Sim, preciso de entrega", { exact: true }));
  await pause(TIMING.checkoutVisibleMs);

  // 9. Entrega e "Cadastrar endereço".
  await moveAndClick(page.getByText("Sim, preciso de entrega", { exact: true }));
  await pause();
  await pause(TIMING.beforeAddressMs);
  await moveAndClick(page.getByRole("link", { name: "Cadastrar endereço" }));
  await page.waitForURL(/\/minha-conta/, { timeout: 15000 });

  // 10. CEP: espera a rua chegar do ViaCEP (o valor aparecer, não um tempo fixo).
  const cep = page.getByLabel("CEP", { exact: true });
  await waitVisible(cep);
  await pause();
  await typeHuman(cep, "80010-000");
  const street = page.getByLabel("Rua / Logradouro", { exact: true });
  await page.waitForFunction(input => (input as HTMLInputElement).value.trim().length > 0, await street.elementHandle(), { timeout: 15000 });
  await pause();

  // 11. Número, "Salvar alterações" e volta ao checkout.
  await typeHuman(page.getByLabel("Número", { exact: true }), "1234");
  await pause();
  await moveAndClick(page.locator("main").getByRole("button", { name: "Salvar alterações" }));
  const backToCheckout = page.getByRole("link", { name: "Voltar ao checkout com alterações salvas" });
  await waitVisible(backToCheckout);
  await pause();
  await moveAndClick(backToCheckout);
  await page.waitForURL(/\/checkout$/, { timeout: 15000 });
  await pause();

  // 12. Rola suavemente até o item do pedido.
  const item = page.locator("main").getByText(PRODUCT, { exact: true }).first();
  await waitVisible(item);
  await smoothScrollTo(item);
  await pause();

  // 13. Cursor sobre "Finalizar compra pelo WhatsApp" até aparecer o aviso do modo de demonstração; 1,5 s.
  const whatsapp = page.getByRole("button", { name: "Finalizar compra pelo WhatsApp" });
  await hover(whatsapp, 0);
  await waitVisible(page.getByText("Checkout desativado no modo de demonstração", { exact: true }));
  await pause(TIMING.whatsappHoverMs);

  // 14. Carrinho do cabeçalho → "Limpar Carrinho".
  await moveAndClick(header.getByRole("button", { name: "Abrir carrinho" }));
  await waitVisible(cart);
  await pause();
  await moveAndClick(cart.getByRole("button", { name: "Limpar Carrinho" }));
  await waitVisible(cart.getByText("Carrinho vazio", { exact: true }));
  await pause();

  // 15. Clique no centro da tela (fora do carrinho) para fechar; pausa final.
  await clickAt(page, VIEWPORT.width / 2, VIEWPORT.height / 2);
  await cart.waitFor({ state: "detached" });
  await pause(TIMING.endMs);
} finally {
  await rec.finish();
}
