import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { createAuthApi, type RegisterInput } from "../lib/auth";
import { AUTH_CHANGE_KEY, AUTH_STORAGE_KEY, createAuthSession, sessionRevalidationDelay } from "../lib/auth-session";

export function useAuth() {
  const [api] = useState(() => createAuthApi(import.meta.env.VITE_API_URL || "/api"));
  const [auth] = useState(() => createAuthSession(api, () => window.localStorage, () => window.localStorage));
  const { session, error, validating } = useSyncExternalStore(auth.subscribe, auth.getSnapshot);

  useEffect(() => {
    // Old per-tab credentials must never resurrect after a shared logout.
    try { window.sessionStorage.removeItem(AUTH_STORAGE_KEY); } catch { /* Storage blocked. */ }
    void auth.restore();
    const synchronize = (event: StorageEvent) => {
      if (event.storageArea === window.localStorage && (event.key === null || event.key === AUTH_STORAGE_KEY || event.key === AUTH_CHANGE_KEY)) void auth.restore();
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
  return { user, accessToken: session?.accessToken, validating, sessionError: error, login, register, logout: auth.logout, invalidate: auth.invalidate, updateAccount: auth.updateAccount };
}
