import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { createAuthApi, type RegisterInput } from "../lib/auth";
import { AUTH_CHANGE_KEY, AUTH_STORAGE_KEY, DEMO_RETURN_KEY, createAuthSession, sessionRevalidationDelay } from "../lib/auth-session";
import { notify } from "../lib/notifications";

export function useAuth() {
  const [api] = useState(() => createAuthApi(import.meta.env.VITE_API_URL || "/api"));
  const [auth] = useState(() => createAuthSession(api, () => window.localStorage, () => window.localStorage, {
    onDemoEnded: () => notify.info("A sessão demonstrativa terminou. Você voltou para a sua conta.")
  }));
  const { session, error, validating, demoActive, demoEnded } = useSyncExternalStore(auth.subscribe, auth.getSnapshot);

  useEffect(() => {
    // Old per-tab credentials must never resurrect after a shared logout.
    try { window.sessionStorage.removeItem(AUTH_STORAGE_KEY); } catch { /* Storage blocked. */ }
    void auth.restore();
    const synchronize = (event: StorageEvent) => {
      if (event.storageArea === window.localStorage && (event.key === null || event.key === AUTH_STORAGE_KEY || event.key === AUTH_CHANGE_KEY || event.key === DEMO_RETURN_KEY)) void auth.restore();
    };
    window.addEventListener("storage", synchronize);
    const revalidate = () => { if (document.visibilityState === "visible") void auth.restore(); };
    window.addEventListener("focus", revalidate);
    document.addEventListener("visibilitychange", revalidate);
    return () => {
      auth.cancelPending();
      window.removeEventListener("storage", synchronize);
      window.removeEventListener("focus", revalidate);
      document.removeEventListener("visibilitychange", revalidate);
    };
  }, [auth]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    let timer: number;
    const schedule = () => {
      timer = window.setTimeout(async () => {
        await auth.restore();
        if (!cancelled) schedule();
      }, sessionRevalidationDelay(session.expiresAt));
    };
    schedule();
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [auth, session]);

  const user = useMemo(() => session ? session.account : null, [session]);
  const register = (input: RegisterInput, signal?: AbortSignal) => api.register(input, signal);
  const login = async (email: string, password: string, signal?: AbortSignal) => {
    const success = await auth.login(email, password, signal);
    return success ? auth.getSnapshot().session?.account ?? null : null;
  };
  // Único ponto que decide o token das requisições: sempre o da sessão ativa (DEMO ou cliente).
  return { user, accessToken: session?.accessToken, validating, sessionError: error, demoActive, demoEnded, enterDemo: auth.enterDemo, exitDemo: auth.exitDemo, login, register, logout: auth.logout, clearError: auth.clearError, invalidate: auth.invalidate, updateAccount: auth.updateAccount };
}
