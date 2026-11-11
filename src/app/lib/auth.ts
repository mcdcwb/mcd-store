export type AccountRole = "USER" | "ADMIN";
// Acesso ao painel informado por GET /auth/me: "admin" (completo), "read-only" (cliente no modo
// demonstração, conforme PANEL_READ_ONLY_FOR_USERS no backend) ou "none". Só orienta a interface;
// o backend decide a cada requisição.
export type PanelAccess = "admin" | "read-only" | "none";
export interface Account { id: number; name: string; email: string; role: AccountRole; panelAccess?: PanelAccess; }
export const panelAccessOf = (account: Account | null | undefined): PanelAccess =>
  account?.role === "ADMIN" ? "admin" : account?.panelAccess === "read-only" ? "read-only" : "none";
export interface AuthSession { accessToken: string; expiresAt: number; account: Account; }
// confirmPassword: confirmação digitada no cadastro; o backend confere de novo e não a grava.
export interface RegisterInput { name: string; email: string; password: string; confirmPassword: string; }
export const AUTH_STORAGE_KEY = "mcd-store_auth_v1";

export class AuthError extends Error {
  code: string;
  constructor(code: string, message: string) { super(message); this.name = "AuthError"; this.code = code; }
}

const unavailable = () => new AuthError("unavailable", "Não foi possível conectar ao serviço de autenticação. Tente novamente.");
const invalidResponse = () => new AuthError("invalid_response", "O serviço de autenticação retornou uma resposta inválida. Tente novamente.");

function isAccount(value: unknown): value is Account {
  if (!value || typeof value !== "object") return false;
  const account = value as Account;
  return Number.isSafeInteger(account.id) && account.id > 0 &&
    typeof account.name === "string" && account.name.trim().length > 0 &&
    typeof account.email === "string" && account.email.includes("@") &&
    (account.role === "USER" || account.role === "ADMIN");
}

export function validateLogin(email: string, password: string): string | null {
  const normalizedEmail = email.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || normalizedEmail.length > 254) return "Informe um e-mail v\u00e1lido.";
  if (!password) return "Informe uma senha.";
  if (password.length > 128) return "A senha deve ter no m\u00e1ximo 128 caracteres.";
  return null;
}

export function validateRegistration({ name, email, password, confirmPassword }: RegisterInput): string | null {
  if (!name.trim()) return "Informe seu nome completo.";
  if (name.trim().length < 2 || name.trim().length > 100) return "O nome deve ter de 2 a 100 caracteres.";
  const normalizedEmail = email.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || normalizedEmail.length > 254) return "Informe um e-mail v\u00e1lido.";
  if (!password) return "Informe uma senha.";
  if (password.length < 6) return "A senha deve conter pelo menos 6 caracteres.";
  if (password.length > 128) return "A senha deve ter no m\u00e1ximo 128 caracteres.";
  if (!/[A-Z]/.test(password)) return "A senha deve conter pelo menos uma letra mai\u00fascula.";
  if (!/[0-9]/.test(password)) return "A senha deve conter pelo menos um n\u00famero.";
  if (confirmPassword !== password) return "A confirma\u00e7\u00e3o da senha n\u00e3o confere.";
  return null;
}

export function createAuthApi(baseUrl = "/api", fetcher: typeof fetch = fetch) {
  const base = baseUrl.replace(/\/$/, "");
  async function request(path: string, init: RequestInit, signal?: AbortSignal): Promise<unknown> {
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal?.aborted) controller.abort();
    signal?.addEventListener("abort", abort, { once: true });
    const timeout = setTimeout(abort, 10000);
    try {
      const response = await fetcher(base + path, { ...init, cache: "no-store", signal: controller.signal });
      if (response.status === 401) throw new AuthError("unauthorized", path === "/auth/login" ? "E-mail ou senha inválidos." : "Sua sessão expirou ou não é mais válida. Entre novamente.");
      if (response.status === 403) throw new AuthError("forbidden", "Esta conta não tem acesso autorizado.");
      if (response.status === 409) throw new AuthError("conflict", "Este e-mail já está cadastrado.");
      if (response.status === 429) throw new AuthError("rate_limit", "Muitas tentativas. Aguarde e tente novamente.");
      if (response.status >= 500) throw unavailable();
      if (response.status === 400) throw new AuthError("validation", "Verifique os dados informados.");
      if (!response.ok) throw invalidResponse();
      try { return await response.json(); } catch { throw invalidResponse(); }
    } catch (error) {
      if (signal?.aborted) throw new AuthError("cancelled", "Operação cancelada.");
      if (error instanceof AuthError) throw error;
      throw unavailable();
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
    }
  }

  async function me(accessToken: string, signal?: AbortSignal): Promise<Account> {
    const body = await request("/auth/me", { headers: { Authorization: "Bearer " + accessToken } }, signal) as { account?: unknown; panelAccess?: unknown };
    if (!body || !isAccount(body.account)) throw invalidResponse();
    const panelAccess: PanelAccess = body.panelAccess === "admin" || body.panelAccess === "read-only" ? body.panelAccess : "none";
    return { ...body.account, panelAccess };
  }

  async function login(email: string, password: string, signal?: AbortSignal): Promise<AuthSession> {
    const validation = validateLogin(email, password);
    if (validation) throw new AuthError("validation", validation);
    const body = await request("/auth/login", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim().toLowerCase(), password })
    }, signal);
    return acceptSession(body, signal);
  }

  async function acceptSession(raw: unknown, signal?: AbortSignal): Promise<AuthSession> {
    const body = raw as { accessToken?: unknown; tokenType?: unknown; expiresIn?: unknown; expiresAt?: unknown; account?: unknown };
    if (!body || typeof body.accessToken !== "string" || !body.accessToken.trim() || body.tokenType !== "Bearer" ||
      typeof body.expiresIn !== "number" || !Number.isFinite(body.expiresIn) || body.expiresIn <= 0 ||
      !Number.isSafeInteger(body.expiresIn) ||
      typeof body.expiresAt !== "number" || !Number.isSafeInteger(body.expiresAt) || body.expiresAt <= 0 ||
      !isAccount(body.account)) throw invalidResponse();
    // Server timestamp mirrors the signed exp claim; the local clock is not an authority.
    const expiresAt = body.expiresAt;
    const account = await me(body.accessToken, signal);
    if (account.id !== body.account.id || account.email !== body.account.email || account.role !== body.account.role) throw invalidResponse();
    return { accessToken: body.accessToken, expiresAt, account };
  }

  async function register(input: RegisterInput, signal?: AbortSignal): Promise<Account> {
    const validation = validateRegistration(input);
    if (validation) throw new AuthError("validation", validation);
    const body = await request("/auth/register", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: input.name.trim(), email: input.email.trim().toLowerCase(), password: input.password, confirmPassword: input.confirmPassword })
    }, signal) as { account?: unknown };
    if (!body || !isAccount(body.account) || body.account.role !== "USER") throw invalidResponse();
    return body.account;
  }
  return { login, register, me };
}