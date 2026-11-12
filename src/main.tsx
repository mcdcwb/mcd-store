import { createRoot } from "react-dom/client";
import App from "./app/App.tsx";
import { BrowserRouter, useLocation } from "react-router";
import { useLayoutEffect, useSyncExternalStore } from "react";
import { Toaster } from "./app/components/ui/sonner";
import "./styles/index.css";

function StoreTheme() {
  const { pathname } = useLocation();
  useLayoutEffect(() => {
    const root = document.documentElement;
    if (pathname === "/manager" || pathname.startsWith("/manager/")) delete root.dataset.storeTheme;
    else root.dataset.storeTheme = "dark";
    return () => { delete root.dataset.storeTheme; };
  }, [pathname]);
  return null;
}

// Loja: posição fixa por dispositivo. Desktop (>= 768px) no topo à esquerda, logo abaixo do header fixo (65px):
// nunca por cima da gaveta do carrinho, que ocupa a direita. Celular embaixo, centralizado, acima do botão
// flutuante do WhatsApp (bottom 20px + 44px). O painel (manager) mantém o topo à direita: à esquerda fica o menu dele.
const DESKTOP_QUERY = "(min-width: 768px)";
const subscribeDesktop = (change: () => void) => {
  const query = window.matchMedia(DESKTOP_QUERY);
  query.addEventListener("change", change);
  return () => query.removeEventListener("change", change);
};
const STORE_TOASTS = {
  desktop: { position: "top-left", offset: { top: 76, left: 24 }, mobileOffset: { top: 76, left: 24 } },
  mobile: { position: "bottom-center", offset: { bottom: 76, left: 16, right: 16 }, mobileOffset: { bottom: 76, left: 16, right: 16 } },
} as const;

function Notifications() {
  const { pathname } = useLocation();
  const manager = pathname === "/manager" || pathname.startsWith("/manager/");
  const desktop = useSyncExternalStore(subscribeDesktop, () => window.matchMedia(DESKTOP_QUERY).matches);
  const placement = manager
    ? { position: "top-right", offset: { top: 72, right: 24 }, mobileOffset: { top: 72, left: 16, right: 16 } } as const
    : STORE_TOASTS[desktop ? "desktop" : "mobile"];
  return <Toaster theme={manager ? "light" : "dark"} position={placement.position} duration={manager ? 3500 : 2500} expand={!manager} visibleToasts={3} closeButton
    offset={placement.offset} mobileOffset={placement.mobileOffset}
    containerAriaLabel="Notificações"
    toastOptions={{ closeButtonAriaLabel: "Fechar notificação", style: {
      fontFamily: "var(--font-sans)", padding: "12px 16px", boxShadow: "0 4px 12px rgb(0 0 0 / 0.06)",
    } }} />;
}

createRoot(document.getElementById("root")!).render(<BrowserRouter>
  <StoreTheme />
  <App />
  <Notifications />
</BrowserRouter>);
