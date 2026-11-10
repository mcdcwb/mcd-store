import { AuthError, type Account, type AuthSession, type createAuthApi } from "./auth.ts";

export const AUTH_STORAGE_KEY = "mcd-store_auth_v1";
export const LEGACY_USER_KEY = "brecho_user_v1";
export const AUTH_CHANGE_KEY = "mcd-store_auth_change_v1";
// Modelo antigo do modo demonstração (sessão DEMO trocada pela do cliente). Limpos uma única vez:
// a chave de retorno guardava o token do CLIENTE; o token DEMO tinha a audience abaixo.
export const LEGACY_DEMO_RETURN_KEY = "mcd-store_auth_demo_return_v1";
export const LEGACY_DEMO_CLEANUP_KEY = "mcd-store_demo_legacy_cleanup_v1";
const LEGACY_DEMO_AUDIENCE = "mcd-store-demo";

type StorageAccess = () => Pick<Storage, "getItem" | "setItem" | "removeItem">;
type State = { session: AuthSession | null; error: string | null; validating: boolean };

// Lê só a audience do JWT (sem validar): serve apenas para reconhecer um token DEMO antigo.
function tokenAudience(token: string) {
  try { return JSON.parse(atob(token.split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/"))).aud as unknown; }
  catch { return null; }
}

export function createAuthSession(
  api: ReturnType<typeof createAuthApi>,
  storage: StorageAccess,
  legacyStorage: StorageAccess
) {
  let state: State = { session: null, error: null, validating: true };
  let generation = 0;
  let legacyDemoChecked = false;
  let pendingLogin: string | null = null;
  const listeners = new Set<() => void>();

  function publish(session: AuthSession | null, error: string | null = null, validating = false) {
    state = { session, error, validating };
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
  // Uma única vez: quem testou o modelo antigo pode ter um token DEMO salvo como sessão ativa e o
  // token do próprio cliente guardado à parte. O token do cliente volta a ser o ativo (ou a sessão é
  // descartada) e a chave antiga some. Depois disso a marca impede repetir.
  function clearLegacyDemoSession() {
    if (legacyDemoChecked) return;
    legacyDemoChecked = true;
    try {
      const store = storage();
      if (store.getItem(LEGACY_DEMO_CLEANUP_KEY)) return;
      const active = read(), saved = read(LEGACY_DEMO_RETURN_KEY);
      if (active && tokenAudience(active.accessToken) === LEGACY_DEMO_AUDIENCE) {
        if (saved && tokenAudience(saved.accessToken) !== LEGACY_DEMO_AUDIENCE) store.setItem(AUTH_STORAGE_KEY, JSON.stringify(saved));
        else store.removeItem(AUTH_STORAGE_KEY);
      }
      store.removeItem(LEGACY_DEMO_RETURN_KEY);
      store.setItem(LEGACY_DEMO_CLEANUP_KEY, "1");
    } catch { /* Storage bloqueado: nada salvo, nada a limpar. */ }
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

  function logout(error: string | null = null) {
    generation++;
    pendingLogin = null;
    clearStorage();
    announceChange();
    publish(null, error);
  }

  const login = (email: string, password: string, signal?: AbortSignal) => authenticate(() => api.login(email, password, signal), signal);

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
    clearLegacyDemoSession();
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
      logout(error instanceof Error ? error.message : "Não foi possível validar a sessão.");
    }
  }

  return {
    login, restore, logout,
    clearError() {
      if (state.error) publish(state.session, null, state.validating);
    },
    invalidate(accessToken: string | undefined, error: string) {
      if (accessToken && state.session?.accessToken === accessToken && read()?.accessToken === accessToken) logout(error);
      else void restore();
    },
    updateAccount(accessToken: string, account: Account) {
      const session = state.session;
      if (!session || session.accessToken !== accessToken || session.account.id !== account.id || session.account.role !== account.role) return;
      // Respostas de perfil não trazem panelAccess: mantém o que veio do /auth/me.
      const panelAccess = account.panelAccess ?? session.account.panelAccess;
      publish({ ...session, account: panelAccess ? { ...account, panelAccess } : account });
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
