import { toast } from "sonner";

// Modo demonstração: o cliente (USER) navega pelo painel em modo leitura. O backend responde
// 403 { demo: true, message } a qualquer escrita dele nas rotas do painel (requireAdminOrReadOnly).
// Este arquivo é o ÚNICO responsável pelo aviso: throwIfDemoBlocked mostra o toast neutro e lança
// DemoBlockedError (status 423, que NÃO desloga: os tratamentos de 401/403 continuam valendo só para
// sessões realmente inválidas). As telas usam notifyError/isDemoBlocked e ignoram esse erro: sem toast
// vermelho, sem mensagem inline e sem marcar o formulário como "erro".
export const DEMO_MESSAGE = "Modo demonstração: alterações não são salvas.";
export const DEMO_BLOCK_STATUS = 423;
export const DEMO_TOAST_ID = "demo-blocked";

export class DemoBlockedError extends Error {
  readonly status = DEMO_BLOCK_STATUS;
  constructor(message = DEMO_MESSAGE) { super(message); this.name = "DemoBlockedError"; }
}
export const isDemoBlocked = (error: unknown): error is DemoBlockedError => error instanceof DemoBlockedError;

export async function readDemoBlock(response: Response): Promise<string | null> {
  if (response.status !== 403) return null;
  const data = await response.clone().json().catch(() => null) as { demo?: unknown; message?: unknown; error?: unknown } | null;
  return data?.demo === true ? String(data.message || data.error || DEMO_MESSAGE) : null;
}

// Id fixo: cliques repetidos atualizam o MESMO toast em vez de empilhar novos.
// Usa o sonner direto (e não lib/notifications): o bloqueio só acontece no /manager, onde o tema escuro
// da loja está desligado (main.tsx), e ali notify.warning é exatamente toast.warning. Sem importar
// notifications (que puxa um .tsx), este arquivo e o manager/api.ts carregam nos testes do Node.
export function announceDemoBlock(message = DEMO_MESSAGE) {
  toast.warning(message, { id: DEMO_TOAST_ID });
}

// Ponto único usado pelos helpers de requisição logo após receber a resposta.
export async function throwIfDemoBlocked(response: Response) {
  const message = await readDemoBlock(response);
  if (message === null) return;
  announceDemoBlock(message);
  throw new DemoBlockedError(message);
}

// Toast de erro das telas: o bloqueio de demonstração já foi avisado (neutro) e é ignorado aqui;
// erros reais (validação, conexão, 500) continuam com o toast vermelho de sempre.
export function notifyError(error: unknown, fallback: string) {
  if (isDemoBlocked(error)) return;
  toast.error(error instanceof Error && error.message ? error.message : fallback);
}
