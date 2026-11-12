import { useEffect, useState } from "react";
import LatticeLoader from "./LatticeLoader";

// Espera inicial do catálogo (servidor gratuito acordando). Nada nos primeiros SHOW_AFTER_MS, para não piscar
// numa visita rápida; depois, o LatticeLoader com o cronômetro. Ao terminar, some com um fade curto por cima
// do conteúdo que entra (posição absoluta só na saída: o catálogo ocupa o lugar sem salto).
export const SHOW_AFTER_MS = 1500;
const FADE_MS = 200;

export function StoreLoading({ loading }: { loading: boolean }) {
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (!loading) return;
    setLeaving(false);
    const timer = window.setTimeout(() => setVisible(true), SHOW_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [loading]);
  useEffect(() => {
    if (loading || !visible) return;
    setLeaving(true);
    const timer = window.setTimeout(() => { setVisible(false); setLeaving(false); }, FADE_MS);
    return () => window.clearTimeout(timer);
  }, [loading, visible]);
  if (!visible) return null;
  return (
    <div data-store-loading className={`store-loading flex flex-col items-center gap-3 py-24 text-center transition-opacity duration-200 ${leaving ? "pointer-events-none absolute inset-x-0 top-0 opacity-0" : "opacity-100"}`}>
      <LatticeLoader label="Preparando a loja" pattern="orbit" grid={3} shape="square" color="var(--primary)" cellSize={8} gap={3} fontSize={16} className="text-foreground" />
      <p className="max-w-xs text-xs text-muted-foreground">O servidor gratuito pode levar até 1 minuto para acordar na primeira visita.</p>
    </div>
  );
}
