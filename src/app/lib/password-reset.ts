// Recuperação de senha (cliente): POST /auth/esqueci-senha e POST /auth/redefinir-senha.
const base = () => (import.meta.env.VITE_API_URL || "/api").replace(/\/$/, "");

export class PasswordResetError extends Error {
  code?: string;
  constructor(message: string, code?: string) { super(message); this.name = "PasswordResetError"; this.code = code; }
}

async function post(path: string, body: unknown, signal?: AbortSignal) {
  let response: Response;
  try {
    response = await fetch(base() + path, { method: "POST", signal, cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new PasswordResetError("Não foi possível conectar. Tente novamente.");
  }
  const data = await response.json().catch(() => null) as { message?: string; error?: string; code?: string } | null;
  if (!response.ok) throw new PasswordResetError(data?.error || "Não foi possível concluir. Tente novamente.", data?.code);
  return data?.message ?? "";
}

export const requestPasswordReset = (email: string, signal?: AbortSignal) => post("/auth/esqueci-senha", { email }, signal);
export const resetPassword = (token: string, password: string, confirmPassword: string, signal?: AbortSignal) =>
  post("/auth/redefinir-senha", { token, password, confirmPassword }, signal);
