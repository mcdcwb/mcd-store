import { AuthError, type Account, type AuthSession, type createAuthApi } from "./auth.ts";

export const AUTH_STORAGE_KEY = "mcd-store_auth_v1";
export const LEGACY_USER_KEY = "brecho_user_v1";
export const AUTH_CHANGE_KEY = "mcd-store_auth_change_v1";
// Modo demonstração: a sessão do CLIENTE fica guardada aqui enquanto a sessão DEMO é a ativa
// (AUTH_STORAGE_KEY). Só o token ativo é entregue ao app; este volta a ser o ativo ao sair do demo.
export const DEMO_RETURN_KEY = "mcd-store_auth_demo_return_v1";

type StorageAccess = () => Pick<Storage, "getItem" | "setItem" | "removeItem">;
// demoEnded: contador que avança sempre que uma sessão DEMO termina (o app volta para a loja).
type State = { session: AuthSession | null; error: string | null; validating: boolean; demoActive: boolean; demoEnded: number };

export function createAuthSession(
  api: ReturnType<typeof createAuthApi>,
  storage: StorageAccess,
  legacyStorage: StorageAccess,
  options: { onDemoEnded?: () => void } = {}
) {
  let state: State = { session: null, error: null, validating: true, demoActive: false, demoEnded: 0 };
  let demoEnded = 0;
  let generation = 0;
  let pendingLogin: string | null = null;
  const listeners = new Set<() => void>();

  function publish(session: AuthSession | null, error: string | null = null, validating = false) {
    state = { session, error, validating, demoActive: session?.account.role === "DEMO" && readReturn() !== null, demoEnded };
    listeners.forEach(listener => listener());
  }
  function clearStorage() {
    try { storage().removeItem(AUTH_STORAGE_KEY); } catch { /* Storage may be blocked. */ }
  }
  function save(session: AuthSession) {
    try {
      storage().setItem(AUTH_STORAGE_KEY, JSON.stringify({
        accessToken: session.accessToken, expiresAt: session.expiresAt
      }));
    } catch { throw new Error("Permita o armazenamento deste site para manter a sessão entre abas."); }
  }
  function read(key = AUTH_STORAGE_KEY) {
    try {
      const value = JSON.parse(storage().getItem(key) ?? "null");
      if (value && typeof value.accessToken === "string" && value.accessToken.trim() &&
        Number.isFinite(value.expiresAt)) return {
          accessToken: value.accessToken as string, expiresAt: value.expiresAt as number
        };
    } catch { /* Malformed or inaccessible storage cannot authenticate anyone. */ }
    return null;
  }
  const readReturn = () => read(DEMO_RETURN_KEY);
  function clearReturn() {
    try { storage().removeItem(DEMO_RETURN_KEY); } catch { /* Storage may be blocked. */ }
  }
  function changeId() {
    try { return storage().getItem(AUTH_CHANGE_KEY); } catch { return null; }
  }
  function announceChange() {
    const id = crypto.randomUUID();
    try { storage().setItem(AUTH_CHANGE_KEY, id); } catch { /* Memory-only session. */ }
    return changeId();
  }
  function unchanged(saved: { accessToken: string }, change: string | null) {
    return changeId() === change && read()?.accessToken === saved.accessToken;
  }

  // Sair (inclusive no modo demo) encerra as duas sessões.
  function logout(error: string | null = null) {
    generation++;
    pendingLogin = null;
    clearStorage();
    clearReturn();
    announceChange();
    publish(null, error);
  }

  const login = (email: string, password: string, signal?: AbortSignal) => authenticate(() => api.login(email, password, signal), signal);

  // Liga o modo demonstração: só a partir de uma sessão de CLIENTE válida. A conta do cliente
  // não muda; o token dele é guardado em DEMO_RETURN_KEY e o token DEMO passa a ser o ativo.
  async function enterDemo(signal?: AbortSignal) {
    const user = state.session;
    if (!user || user.account.role !== "USER" || read()?.accessToken !== user.accessToken) throw new AuthError("forbidden", "Entre com sua conta de cliente para usar o modo demonstração.");
    const demo = await api.demoLogin(user.accessToken, signal);
    if (state.session?.accessToken !== user.accessToken) return false; // a sessão mudou no meio
    generation++;
    try { storage().setItem(DEMO_RETURN_KEY, JSON.stringify({ accessToken: user.accessToken, expiresAt: user.expiresAt })); }
    catch { throw new Error("Permita o armazenamento deste site para usar o modo demonstração."); }
    save(demo);
    announceChange();
    publish(demo);
    return true;
  }
  // Desliga o modo demonstração: a sessão guardada do cliente volta a ser a ativa e é revalidada.
  async function exitDemo(ended = false) {
    const saved = readReturn();
    generation++;
    demoEnded++;
    clearReturn();
    if (!saved) { logout(ended ? "A sessão demonstrativa terminou." : null); return; }
    try { storage().setItem(AUTH_STORAGE_KEY, JSON.stringify(saved)); } catch { /* restore() decide */ }
    announceChange();
    publish(null, null, true);
    if (ended) options.onDemoEnded?.();
    await restore();
  }
  async function authenticate(obtain: () => Promise<AuthSession>, signal?: AbortSignal) {
    const current = ++generation;
    clearStorage();
    const change = announceChange();
    pendingLogin = change;
    publish(null, null, true);
    try {
      const session = await obtain();
      if (current !== generation || signal?.aborted || changeId() !== change) return false;
      pendingLogin = null;
      save(session);
      publish(session);
      return true;
    } catch (error) {
      if (current === generation && changeId() === change) {
        pendingLogin = null;
        clearStorage();
        publish(null, error instanceof Error ? error.message : "Não foi possível entrar.");
      }
      throw error;
    }
  }

  async function restore() {
    try { legacyStorage().removeItem(LEGACY_USER_KEY); } catch { /* Ignore old mock identity. */ }
    // Shared storage, not the previous in-memory identity, is authoritative for
    // choosing the credential. The account/permissions still come from /auth/me.
    if (pendingLogin && pendingLogin === changeId()) return;
    pendingLogin = null;
    const current = ++generation;
    const change = changeId();
    const saved = read();
    if (!saved) {
      clearStorage();
      publish(null, state.error);
      return;
    }
    // Returning from a native file picker revalidates on focus. Keep an already
    // verified session mounted so its form/input and pending upload survive.
    // Initial restoration still blocks access until /auth/me succeeds.
    if (state.session?.accessToken !== saved.accessToken) publish(null, null, true);
    try {
      const account = await api.me(saved.accessToken);
      if (current !== generation) return;
      if (!unchanged(saved, change)) { await restore(); return; }
      if (account.role !== "DEMO") clearReturn(); // sessão de retorno só existe durante o demo
      else if (!readReturn()) { logout("A sessão demonstrativa terminou."); return; } // DEMO sem cliente para voltar
      publish({ ...saved, account });
    } catch (error) {
      if (current !== generation) return;
      if (!unchanged(saved, change)) { await restore(); return; }
      if (error instanceof AuthError && ["unavailable", "rate_limit"].includes(error.code)) {
        // A transport failure is not revocation. Initial restoration stays
        // unauthenticated; an already verified identity survives a retryable error.
        publish(state.session, error.message);
        return;
      }
      // Token DEMO expirado/recusado: volta para a conta do cliente, sem deslogá-lo.
      if (readReturn()) { await exitDemo(true); return; }
      logout(error instanceof Error ? error.message : "Não foi possível validar a sessão.");
    }
  }

  return {
    login, enterDemo, exitDemo, restore, logout,
    clearError() {
      if (state.error) publish(state.session, null, state.validating);
    },
    invalidate(accessToken: string | undefined, error: string) {
      if (accessToken && state.session?.accessToken === accessToken && read()?.accessToken === accessToken) {
        // 401 no modo demo: volta para a conta do cliente em vez de deslogar.
        if (state.session.account.role === "DEMO" && readReturn()) void exitDemo(true);
        else logout(error);
      }
      else void restore();
    },
    updateAccount(accessToken: string, account: Account) {
      const session = state.session;
      if (!session || session.accessToken !== accessToken || session.account.id !== account.id || session.account.role !== account.role) return;
      publish({ ...session, account });
    },
    getSnapshot: () => state,
    cancelPending: () => { generation++; },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    }
  };
}

// Long sessions exceed setTimeout's signed 32-bit limit. This only schedules
// server validation; an elapsed/local deadline never authorizes a logout.
export function sessionRevalidationDelay(expiresAt: number, now = Date.now()) {
  return Math.min(24 * 60 * 60 * 1000, Math.max(60 * 1000, expiresAt - now));
}
