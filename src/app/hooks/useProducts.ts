import { useEffect, useRef, useState } from "react";
import { fetchProducts, type Product } from "../lib/products";

// Primeira visita com o servidor gratuito "dormindo": o carregamento inicial tenta de novo sozinho por até
// INITIAL_WAIT_MS (prazo fixo desde o início ou do "Tentar novamente") antes de mostrar o erro. Depois do primeiro sucesso, as atualizações seguem como antes.
export const INITIAL_WAIT_MS = 60000;
const INITIAL_RETRY_MS = 2000;
export const CATALOG_TIMEOUT_MESSAGE = "A loja não respondeu a tempo. Tente novamente em alguns instantes.";

export function useProducts(load = fetchProducts) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const initial = useRef(true); // até o primeiro sucesso
  const expired = useRef(false); // prazo da espera inicial esgotado (erro na tela, sem novas tentativas automáticas)
  const [deadline, setDeadline] = useState(0);
  useEffect(() => {
    if (!initial.current) return;
    expired.current = false;
    const timer = window.setTimeout(() => {
      if (!initial.current) return;
      expired.current = true;
      setError(CATALOG_TIMEOUT_MESSAGE);
      setLoading(false);
    }, INITIAL_WAIT_MS);
    return () => window.clearTimeout(timer);
  }, [deadline]);
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === "visible") setAttempt(value => value + 1); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    const timer = window.setInterval(refresh, 30000);
    return () => { window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); window.clearInterval(timer); };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timeout = window.setTimeout(() => controller.abort(), 10000);
    let retry: number | undefined;
    load(import.meta.env.VITE_API_URL || "/api", controller.signal)
      .then(data => { if (!active) return; initial.current = false; setProducts(data); setError(null); setLoading(false); })
      .catch(() => {
        if (!active) return;
        if (initial.current) {
          // Espera inicial: tenta de novo até o prazo; depois dele o erro já está na tela.
          if (!expired.current) retry = window.setTimeout(() => setAttempt(value => value + 1), INITIAL_RETRY_MS);
          return;
        }
        setError("Estamos preparando a loja, isso pode levar até 1 minuto na primeira visita.");
      })
      .finally(() => window.clearTimeout(timeout));
    return () => { active = false; window.clearTimeout(timeout); window.clearTimeout(retry); controller.abort(); };
  }, [attempt, load]);
  return { products, loading, error, retry: () => {
    if (initial.current) { setError(null); setLoading(true); setDeadline(value => value + 1); }
    setAttempt(value => value + 1);
  } };
}
