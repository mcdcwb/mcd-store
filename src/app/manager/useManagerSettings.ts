import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { notify } from "../lib/notifications";
import { isStockBadgeSettings, type StockBadgeSettings } from "../../../backend/src/lib/stock-badges";

export function useManagerSettings(token: string, path: string, onUnauthorized: (message: string) => void) {
  const [settings, setSettings] = useState<StockBadgeSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const pending = useRef(false);
  const mounted = useRef(true);
  const unauthorized = useRef(onUnauthorized);
  unauthorized.current = onUnauthorized;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  async function request(method: "GET" | "PUT", signal: AbortSignal, value?: StockBadgeSettings) {
    const response = await fetch((import.meta.env.VITE_API_URL || "/api") + "/settings", {
      method, signal, cache: "no-store",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: method === "PUT" ? JSON.stringify(value) : undefined
    });
    if (response.status === 401 || response.status === 403) {
      const message = "Sua sessão administrativa não está autorizada. Entre novamente.";
      unauthorized.current(message);
      throw new Error(message);
    }
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.error || "Não foi possível acessar as configurações.");
    if (!isStockBadgeSettings(body)) throw new Error("Configuração de estoque inválida recebida do servidor.");
    return body;
  }

  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    let active = true;
    setLoading(true);
    setError(null);
    request("GET", controller.signal).then(value => { if (active) setSettings(value); })
      .catch(reason => { if (active) setError(reason instanceof Error && reason.name !== "AbortError" ? reason.message : "Não foi possível carregar as configurações. Tente novamente."); })
      .finally(() => { clearTimeout(timeout); if (active) setLoading(false); });
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [token, path, revision]);

  async function save(value: StockBadgeSettings) {
    if (pending.current) return false;
    pending.current = true;
    setSaving(true);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const next = await request("PUT", controller.signal, value);
      if (!mounted.current) return false;
      setSettings(next);
      window.dispatchEvent(new Event("store-details-updated"));
      notify.positive("Configurações salvas com sucesso!");
      return true;
    } catch (reason) {
      if (mounted.current) toast.error(reason instanceof Error && reason.name !== "AbortError" ? reason.message : "Não foi possível salvar. Verifique a conexão e tente novamente.");
      return false;
    } finally {
      clearTimeout(timeout);
      pending.current = false;
      if (mounted.current) setSaving(false);
    }
  }
  return { settings, threshold: settings?.lowStockThreshold ?? null, loading, saving, error, save, reload: () => setRevision(n => n + 1) };
}
