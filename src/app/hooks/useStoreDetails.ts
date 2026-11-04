import { useCallback, useEffect, useState } from "react";
import { emptyStoreDetails, storeDetailsRequest } from "../lib/store-settings";
export function useStoreDetails() {
  const [details, setDetails] = useState(emptyStoreDetails);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    let active = true;
    let pending: AbortController | null = null;
    async function load() {
      pending?.abort();
      const controller = new AbortController(); pending = controller;
      setLoading(true);
      const timer = setTimeout(() => controller.abort(), 10000);
      try { const next = await storeDetailsRequest(undefined, undefined, controller.signal); if (active && pending === controller) { setDetails(next); setError(""); } }
      catch { if (active && pending === controller) { setDetails(emptyStoreDetails); setError("Não foi possível carregar as configurações da loja. Tente novamente."); } }
      finally { clearTimeout(timer); if (active && pending === controller) setLoading(false); }
    }
    const refresh = () => { if (document.visibilityState === "visible") void load(); };
    void load();
    window.addEventListener("focus", refresh);
    window.addEventListener("store-details-updated", refresh);
    document.addEventListener("visibilitychange", refresh);
    const timer = setInterval(refresh, 30000);
    return () => { active = false; pending?.abort(); clearInterval(timer); window.removeEventListener("focus", refresh); window.removeEventListener("store-details-updated", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [revision]);
  return { ...details, loading, error, reload };
}
