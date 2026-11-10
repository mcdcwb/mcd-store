import { notify } from "./notifications";

// Painel demonstrativo (role DEMO). O backend responde 403 { demo: true, message } a qualquer escrita;
// o front mostra um toast e converte em um erro próprio (status 423), que NÃO desloga a sessão
// (os tratamentos existentes de 401/403 continuam valendo para sessões realmente inválidas).
export const DEMO_MESSAGE = "Modo demonstração: alterações não são salvas.";
export const DEMO_BLOCK_STATUS = 423;
export const isDemoRole = (role: string | undefined | null) => role === "DEMO";
export const isAdminLike = (role: string | undefined | null) => role === "ADMIN" || role === "DEMO";

export async function readDemoBlock(response: Response): Promise<string | null> {
  if (response.status !== 403) return null;
  const data = await response.clone().json().catch(() => null) as { demo?: unknown; message?: unknown; error?: unknown } | null;
  return data?.demo === true ? String(data.message || data.error || DEMO_MESSAGE) : null;
}
let lastToast = 0;
export function announceDemoBlock(message = DEMO_MESSAGE) {
  const now = Date.now();
  if (now - lastToast < 800) return; // um clique não gera toasts repetidos
  lastToast = now;
  notify.warning(message);
}
